/**
 * devlog — committed snapshot renderer.
 *
 * Regenerates docs/dev-state/{decisions.md,roadmap.md,state.json,dashboard.html}
 * from the DB. Called after every mutating command so the human-readable,
 * git-diffable record (and the visual dashboard) stay in sync without
 * committing the binary .db file.
 */
import type { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SNAPSHOT_DIR, ROADMAP_STATUSES, nowIso } from './db.ts';
import { listDecisions, type DecisionRow } from './decisions.ts';
import { listRoadmap, getHistory, type RoadmapRow } from './roadmap.ts';
import { renderDashboard, type RoadmapWithHistory } from './dashboard.ts';

function mdEscape(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderDecisions(rows: DecisionRow[]): string {
  const lines = ['# Architecture Decisions', '', `_Generated ${nowIso()} — do not edit by hand; regenerated automatically after every devlog mutation._`, ''];
  if (rows.length === 0) {
    lines.push('_No decisions logged yet._', '');
    return lines.join('\n');
  }
  for (const d of rows) {
    lines.push(`## #${d.id} ${d.title}`);
    lines.push('');
    lines.push(`- **Status:** ${d.status}${d.supersedes ? ` (supersedes #${d.supersedes})` : ''}`);
    lines.push(`- **Date:** ${d.created_at}${d.author ? ` · **Author:** ${d.author}` : ''}`);
    if (d.plan_ref) lines.push(`- **Plan:** ${d.plan_ref}`);
    if (d.tags) lines.push(`- **Tags:** ${d.tags}`);
    if (d.context) lines.push(`- **Context:** ${mdEscape(d.context)}`);
    lines.push(`- **Decision:** ${mdEscape(d.decision)}`);
    if (d.rationale) lines.push(`- **Rationale:** ${mdEscape(d.rationale)}`);
    if (d.consequences) lines.push(`- **Consequences:** ${mdEscape(d.consequences)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function renderRoadmap(db: DatabaseSync, rows: RoadmapRow[]): string {
  const lines = ['# Roadmap & State', '', `_Generated ${nowIso()} — do not edit by hand; regenerated automatically after every devlog mutation._`, ''];
  if (rows.length === 0) {
    lines.push('_No roadmap items yet._', '');
    return lines.join('\n');
  }
  for (const status of ROADMAP_STATUSES) {
    const group = rows.filter((r) => r.status === status);
    if (group.length === 0) continue;
    lines.push(`## ${status} (${group.length})`);
    lines.push('');
    lines.push('| ID | Title | Cat | Plan | Planned → Actual | Variance |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const r of group) {
      const scope = `${mdEscape(r.planned_scope) || '—'} → ${mdEscape(r.actual_scope) || '—'}`;
      const variance = mdEscape(r.variance_notes) || mdEscape(r.blocked_reason) || '';
      lines.push(
        `| ${r.id} | ${mdEscape(r.title)} | ${r.category} | ${mdEscape(r.plan_ref) || '—'} | ${scope} | ${variance} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function writeSnapshot(db: DatabaseSync): void {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const decisions = listDecisions(db);
  const roadmap = listRoadmap(db);
  const roadmapWithHistory: RoadmapWithHistory[] = roadmap.map((r) => ({ ...r, history: getHistory(db, r.id) }));
  const state = {
    generatedAt: nowIso(),
    decisions,
    roadmap: roadmapWithHistory,
  };
  writeFileSync(resolve(SNAPSHOT_DIR, 'decisions.md'), renderDecisions(decisions), 'utf8');
  writeFileSync(resolve(SNAPSHOT_DIR, 'roadmap.md'), renderRoadmap(db, roadmap), 'utf8');
  writeFileSync(resolve(SNAPSHOT_DIR, 'state.json'), JSON.stringify(state, null, 2), 'utf8');
  writeFileSync(resolve(SNAPSHOT_DIR, 'dashboard.html'), renderDashboard(decisions, roadmapWithHistory), 'utf8');
}
