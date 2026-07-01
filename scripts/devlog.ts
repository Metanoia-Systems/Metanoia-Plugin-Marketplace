/**
 * devlog — local dev-state CLI (architecture decisions + roadmap tracking).
 *
 * Usage (local testing, from a checkout of this plugin repo):
 *   node scripts/devlog.ts <command> [args]
 *
 * When installed as a Claude Code plugin, the SessionStart hook and the
 * dev-roadmap skill invoke this as:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts <command> [args]
 *
 *   init                          Create the DB + schema (also runs lazily)
 *
 *   decision add --title T --decision D [--context C] [--rationale R]
 *                [--consequences X] [--supersedes ID] [--tags a,b]
 *                [--plan-ref P] [--author A] [--status S]
 *   decision list [--status S] [--tag T] [--json]
 *   decision show <id> [--json]
 *   decision supersede <id> --by <newId>
 *
 *   roadmap add --title T [--category feature|plan|step|tech-debt]
 *               [--status planned] [--priority medium] [--parent ID]
 *               [--plan-ref P] [--planned-scope S] [--description D]
 *   roadmap update <id> [--status S] [--note N] [--blocked-reason R]
 *               [--actual-scope S] [--variance V]
 *   roadmap done <id> [--actual-scope S] [--variance V]
 *   roadmap list [--status S] [--category C] [--plan-ref P] [--tree] [--json]
 *   roadmap show <id> [--json]
 *
 *   status                        Human dashboard of open work + decisions
 *   context                       Compact block for SessionStart injection
 *   snapshot                      Force-regenerate docs/dev-state/*
 *
 * Storage: .claude/dev-state/devlog.db (gitignored). The committed snapshot in
 * docs/dev-state/ — including dashboard.html — is regenerated automatically
 * after every mutating command.
 */
import { openDb, fail, type Flags, parseArgs } from './devlog/db.ts';
import { decisionCommand, listDecisions } from './devlog/decisions.ts';
import { roadmapCommand, listRoadmap } from './devlog/roadmap.ts';
import { writeSnapshot } from './devlog/snapshot.ts';

function runStatus(): void {
  const db = openDb();
  const decisions = listDecisions(db);
  const roadmap = listRoadmap(db);
  const active = roadmap.filter((r) => r.status === 'in_progress');
  const blocked = roadmap.filter((r) => r.status === 'blocked');
  const planned = roadmap.filter((r) => r.status === 'planned');
  const done = roadmap.filter((r) => r.status === 'done');
  const lagging = roadmap.filter((r) => r.variance_notes && r.status !== 'done');

  console.log('devlog status');
  console.log('=============');
  console.log(
    `roadmap: ${planned.length} planned · ${active.length} in-progress · ${blocked.length} blocked · ${done.length} done`,
  );
  console.log(`decisions: ${decisions.length} logged`);
  console.log('');

  if (active.length) {
    console.log('In progress:');
    for (const r of active) console.log(`  ◐ #${r.id} ${r.title}${r.plan_ref ? `  [${r.plan_ref}]` : ''}`);
    console.log('');
  }
  if (blocked.length) {
    console.log('Blocked:');
    for (const r of blocked) console.log(`  ✗ #${r.id} ${r.title}${r.blocked_reason ? ` — ${r.blocked_reason}` : ''}`);
    console.log('');
  }
  if (lagging.length) {
    console.log('Drift / lagging items:');
    for (const r of lagging) console.log(`  ! #${r.id} ${r.title} — ${r.variance_notes}`);
    console.log('');
  }
  db.close();
}

/**
 * Compact, bounded block for the SessionStart hook. Never throws on an empty DB.
 */
function runContext(): void {
  const db = openDb();
  const roadmap = listRoadmap(db);
  const decisions = listDecisions(db);
  const open = roadmap.filter((r) => ['planned', 'in_progress', 'blocked'].includes(r.status));

  if (open.length === 0 && decisions.length === 0) {
    console.log('## Dev-State (devlog)\nNo tracked decisions or roadmap items yet.');
    db.close();
    return;
  }

  const lines: string[] = ['## Dev-State (devlog)', ''];

  const inProgress = open.filter((r) => r.status === 'in_progress');
  const blocked = open.filter((r) => r.status === 'blocked');
  const planned = open.filter((r) => r.status === 'planned').slice(0, 10);

  if (inProgress.length) {
    lines.push('**In progress:**');
    for (const r of inProgress) lines.push(`- #${r.id} ${r.title}${r.plan_ref ? ` _(${r.plan_ref})_` : ''}`);
  }
  if (blocked.length) {
    lines.push('**Blocked:**');
    for (const r of blocked) lines.push(`- #${r.id} ${r.title}${r.blocked_reason ? ` — ${r.blocked_reason}` : ''}`);
  }
  if (planned.length) {
    lines.push('**Planned (next):**');
    for (const r of planned) lines.push(`- #${r.id} ${r.title}`);
  }

  const recentDecisions = decisions
    .filter((d) => d.status === 'accepted' || d.status === 'proposed')
    .slice(0, 8);
  if (recentDecisions.length) {
    lines.push('', '**Recent decisions:**');
    for (const d of recentDecisions) lines.push(`- #${d.id} ${d.title}`);
  }

  // Plain-quoted (not a template literal) — ${CLAUDE_PLUGIN_ROOT} here is
  // literal text for the shell/skill to interpolate later, not a JS
  // expression. Using backticks would make the engine try to evaluate
  // CLAUDE_PLUGIN_ROOT as a real identifier and throw.
  lines.push('', '_Source: `node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts status`. Update roadmap/decisions as you plan & execute._');
  console.log(lines.join('\n'));
  db.close();
}

function main(): void {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === 'help' || command === '--help') {
    // Same plain-quoted-string caveat as runContext() above.
    console.log('Usage: node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts <decision|roadmap|status|context|snapshot|init> ...');
    console.log('See header of scripts/devlog.ts for the full command reference.');
    return;
  }

  if (command === 'status') return runStatus();
  if (command === 'context') return runContext();

  if (command === 'init') {
    const db = openDb();
    writeSnapshot(db);
    db.close();
    console.log('devlog initialized.');
    return;
  }

  if (command === 'snapshot') {
    const db = openDb();
    writeSnapshot(db);
    db.close();
    console.log('Snapshot regenerated in docs/dev-state/ (including dashboard.html).');
    return;
  }

  if (command === 'decision' || command === 'roadmap') {
    const sub = argv[1];
    if (!sub) fail(`${command} requires a subcommand`);
    const { positionals, flags } = parseArgs(argv.slice(2));
    const db = openDb();
    const mutated =
      command === 'decision'
        ? decisionCommand(db, sub, positionals, flags as Flags)
        : roadmapCommand(db, sub, positionals, flags as Flags);
    if (mutated) writeSnapshot(db);
    db.close();
    return;
  }

  fail(`unknown command '${command}'. Use decision|roadmap|status|context|snapshot|init`);
}

main();
