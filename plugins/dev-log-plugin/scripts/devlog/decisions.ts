/** devlog — architecture decision log commands. */
import type { DatabaseSync } from 'node:sqlite';
import {
  DECISION_STATUSES,
  assertOneOf,
  fail,
  flagBool,
  flagNum,
  flagStr,
  nowIso,
  type Flags,
} from './db.ts';

export interface DecisionRow {
  id: number;
  created_at: string;
  title: string;
  context: string | null;
  decision: string;
  rationale: string | null;
  consequences: string | null;
  status: string;
  supersedes: number | null;
  tags: string | null;
  plan_ref: string | null;
  author: string | null;
}

export function listDecisions(db: DatabaseSync, opts: { status?: string; tag?: string } = {}): DecisionRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status) {
    where.push('status = ?');
    params.push(opts.status);
  }
  if (opts.tag) {
    where.push("(',' || COALESCE(tags,'') || ',') LIKE ?");
    params.push(`%,${opts.tag},%`);
  }
  const sql =
    'SELECT * FROM decisions' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY id DESC';
  return db.prepare(sql).all(...params) as DecisionRow[];
}

function getDecision(db: DatabaseSync, id: number): DecisionRow | undefined {
  return db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as DecisionRow | undefined;
}

function printDecision(d: DecisionRow): void {
  console.log(`#${d.id} [${d.status}] ${d.title}`);
  console.log(`  created: ${d.created_at}${d.author ? `  author: ${d.author}` : ''}`);
  if (d.plan_ref) console.log(`  plan: ${d.plan_ref}`);
  if (d.tags) console.log(`  tags: ${d.tags}`);
  if (d.supersedes) console.log(`  supersedes: #${d.supersedes}`);
  if (d.context) console.log(`  context: ${d.context}`);
  console.log(`  decision: ${d.decision}`);
  if (d.rationale) console.log(`  rationale: ${d.rationale}`);
  if (d.consequences) console.log(`  consequences: ${d.consequences}`);
}

/**
 * Handle `decision <sub> ...`. Returns true if the store was mutated
 * (so the caller can regenerate the snapshot).
 */
export function decisionCommand(db: DatabaseSync, sub: string, positionals: string[], flags: Flags): boolean {
  const json = flagBool(flags, 'json');

  switch (sub) {
    case 'add': {
      const title = flagStr(flags, 'title');
      const decision = flagStr(flags, 'decision');
      if (!title || !decision) fail('decision add requires --title and --decision');
      const status = flagStr(flags, 'status') ?? 'accepted';
      assertOneOf(status, DECISION_STATUSES, 'status');
      const supersedes = flagNum(flags, 'supersedes');
      if (supersedes !== undefined && !getDecision(db, supersedes)) {
        fail(`--supersedes #${supersedes} does not exist`);
      }
      const res = db
        .prepare(
          `INSERT INTO decisions
             (created_at, title, context, decision, rationale, consequences, status, supersedes, tags, plan_ref, author)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          nowIso(),
          title,
          flagStr(flags, 'context') ?? null,
          decision,
          flagStr(flags, 'rationale') ?? null,
          flagStr(flags, 'consequences') ?? null,
          status,
          supersedes ?? null,
          flagStr(flags, 'tags') ?? null,
          flagStr(flags, 'plan-ref') ?? null,
          flagStr(flags, 'author') ?? null,
        );
      const id = Number(res.lastInsertRowid);
      if (supersedes !== undefined) {
        db.prepare("UPDATE decisions SET status = 'superseded' WHERE id = ?").run(supersedes);
      }
      if (json) console.log(JSON.stringify({ id }));
      else console.log(`Logged decision #${id}: ${title}`);
      return true;
    }

    case 'list': {
      const rows = listDecisions(db, {
        status: flagStr(flags, 'status'),
        tag: flagStr(flags, 'tag'),
      });
      if (json) {
        console.log(JSON.stringify(rows, null, 2));
      } else if (rows.length === 0) {
        console.log('No decisions logged.');
      } else {
        for (const d of rows) console.log(`#${d.id} [${d.status}] ${d.title}`);
      }
      return false;
    }

    case 'show': {
      const id = Number(positionals[0]);
      if (!Number.isFinite(id)) fail('decision show requires a numeric <id>');
      const d = getDecision(db, id);
      if (!d) fail(`decision #${id} not found`);
      if (json) console.log(JSON.stringify(d, null, 2));
      else printDecision(d as DecisionRow);
      return false;
    }

    case 'supersede': {
      const id = Number(positionals[0]);
      const by = flagNum(flags, 'by');
      if (!Number.isFinite(id) || by === undefined) {
        fail('usage: decision supersede <id> --by <newId>');
      }
      if (!getDecision(db, id)) fail(`decision #${id} not found`);
      if (!getDecision(db, by!)) fail(`decision #${by} not found`);
      db.prepare("UPDATE decisions SET status = 'superseded' WHERE id = ?").run(id);
      db.prepare('UPDATE decisions SET supersedes = ? WHERE id = ?').run(id, by!);
      console.log(`Decision #${id} superseded by #${by}`);
      return true;
    }

    default:
      fail(`unknown decision subcommand '${sub}'. Use add|list|show|supersede`);
  }
}
