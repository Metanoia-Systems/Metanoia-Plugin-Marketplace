/** devlog — roadmap / state tracking commands (with drift history). */
import type { DatabaseSync } from 'node:sqlite';
import {
  ROADMAP_CATEGORIES,
  ROADMAP_STATUSES,
  assertOneOf,
  fail,
  flagBool,
  flagNum,
  flagStr,
  nowIso,
  type Flags,
} from './db.ts';

export interface RoadmapRow {
  id: number;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  priority: string | null;
  parent_id: number | null;
  plan_ref: string | null;
  planned_scope: string | null;
  actual_scope: string | null;
  variance_notes: string | null;
  blocked_reason: string | null;
}

export interface RoadmapHistoryRow {
  id: number;
  roadmap_id: number;
  changed_at: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
}

export function listRoadmap(
  db: DatabaseSync,
  opts: { status?: string; category?: string; planRef?: string } = {},
): RoadmapRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status) {
    where.push('status = ?');
    params.push(opts.status);
  }
  if (opts.category) {
    where.push('category = ?');
    params.push(opts.category);
  }
  if (opts.planRef) {
    where.push('plan_ref = ?');
    params.push(opts.planRef);
  }
  const sql =
    'SELECT * FROM roadmap' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY id ASC';
  return db.prepare(sql).all(...params) as RoadmapRow[];
}

export function getHistory(db: DatabaseSync, roadmapId: number): RoadmapHistoryRow[] {
  return db
    .prepare('SELECT * FROM roadmap_history WHERE roadmap_id = ? ORDER BY id ASC')
    .all(roadmapId) as RoadmapHistoryRow[];
}

function getRoadmap(db: DatabaseSync, id: number): RoadmapRow | undefined {
  return db.prepare('SELECT * FROM roadmap WHERE id = ?').get(id) as RoadmapRow | undefined;
}

function recordTransition(
  db: DatabaseSync,
  roadmapId: number,
  from: string | null,
  to: string,
  note?: string,
): void {
  db.prepare(
    'INSERT INTO roadmap_history (roadmap_id, changed_at, from_status, to_status, note) VALUES (?, ?, ?, ?, ?)',
  ).run(roadmapId, nowIso(), from, to, note ?? null);
}

const STATUS_MARK: Record<string, string> = {
  planned: '○',
  in_progress: '◐',
  blocked: '✗',
  done: '●',
  abandoned: '–',
};

function printRoadmapLine(r: RoadmapRow, indent = ''): void {
  const mark = STATUS_MARK[r.status] ?? '?';
  console.log(`${indent}${mark} #${r.id} [${r.status}] (${r.category}) ${r.title}`);
  if (r.blocked_reason) console.log(`${indent}    blocked: ${r.blocked_reason}`);
  if (r.variance_notes) console.log(`${indent}    variance: ${r.variance_notes}`);
}

/**
 * Handle `roadmap <sub> ...`. Returns true if the store was mutated.
 */
export function roadmapCommand(db: DatabaseSync, sub: string, positionals: string[], flags: Flags): boolean {
  const json = flagBool(flags, 'json');

  switch (sub) {
    case 'add': {
      const title = flagStr(flags, 'title');
      if (!title) fail('roadmap add requires --title');
      const category = flagStr(flags, 'category') ?? 'feature';
      assertOneOf(category, ROADMAP_CATEGORIES, 'category');
      const status = flagStr(flags, 'status') ?? 'planned';
      assertOneOf(status, ROADMAP_STATUSES, 'status');
      const parentId = flagNum(flags, 'parent');
      if (parentId !== undefined && !getRoadmap(db, parentId)) {
        fail(`--parent #${parentId} does not exist`);
      }
      const ts = nowIso();
      const res = db
        .prepare(
          `INSERT INTO roadmap
             (created_at, updated_at, title, description, category, status, priority, parent_id, plan_ref, planned_scope)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ts,
          ts,
          title,
          flagStr(flags, 'description') ?? null,
          category,
          status,
          flagStr(flags, 'priority') ?? 'medium',
          parentId ?? null,
          flagStr(flags, 'plan-ref') ?? null,
          flagStr(flags, 'planned-scope') ?? null,
        );
      const id = Number(res.lastInsertRowid);
      recordTransition(db, id, null, status, 'created');
      if (json) console.log(JSON.stringify({ id }));
      else console.log(`Added roadmap #${id}: ${title}`);
      return true;
    }

    case 'update': {
      const id = Number(positionals[0]);
      if (!Number.isFinite(id)) fail('roadmap update requires a numeric <id>');
      const row = getRoadmap(db, id);
      if (!row) fail(`roadmap #${id} not found`);
      const current = row as RoadmapRow;
      const status = flagStr(flags, 'status');
      const note = flagStr(flags, 'note');
      const blockedReason = flagStr(flags, 'blocked-reason');
      if (status) assertOneOf(status, ROADMAP_STATUSES, 'status');

      const sets: string[] = ['updated_at = ?'];
      const params: unknown[] = [nowIso()];
      if (status) {
        sets.push('status = ?');
        params.push(status);
      }
      if (blockedReason !== undefined) {
        sets.push('blocked_reason = ?');
        params.push(blockedReason);
      }
      if (flagStr(flags, 'planned-scope') !== undefined) {
        sets.push('planned_scope = ?');
        params.push(flagStr(flags, 'planned-scope'));
      }
      if (flagStr(flags, 'actual-scope') !== undefined) {
        sets.push('actual_scope = ?');
        params.push(flagStr(flags, 'actual-scope'));
      }
      if (flagStr(flags, 'variance') !== undefined) {
        sets.push('variance_notes = ?');
        params.push(flagStr(flags, 'variance'));
      }
      params.push(id);
      db.prepare(`UPDATE roadmap SET ${sets.join(', ')} WHERE id = ?`).run(...params);

      if (status && status !== current.status) {
        recordTransition(db, id, current.status, status, note);
      } else if (note) {
        recordTransition(db, id, current.status, current.status, note);
      }
      if (json) console.log(JSON.stringify({ id, status: status ?? current.status }));
      else console.log(`Updated roadmap #${id}${status ? ` -> ${status}` : ''}`);
      return true;
    }

    case 'done': {
      const id = Number(positionals[0]);
      if (!Number.isFinite(id)) fail('roadmap done requires a numeric <id>');
      const row = getRoadmap(db, id);
      if (!row) fail(`roadmap #${id} not found`);
      const current = row as RoadmapRow;
      const actual = flagStr(flags, 'actual-scope');
      const variance = flagStr(flags, 'variance');
      db.prepare(
        `UPDATE roadmap
           SET status = 'done', updated_at = ?,
               actual_scope = COALESCE(?, actual_scope),
               variance_notes = COALESCE(?, variance_notes)
         WHERE id = ?`,
      ).run(nowIso(), actual ?? null, variance ?? null, id);
      if (current.status !== 'done') {
        recordTransition(db, id, current.status, 'done', variance ?? flagStr(flags, 'note'));
      }
      if (json) console.log(JSON.stringify({ id, status: 'done' }));
      else console.log(`Completed roadmap #${id}: ${current.title}`);
      return true;
    }

    case 'list': {
      const rows = listRoadmap(db, {
        status: flagStr(flags, 'status'),
        category: flagStr(flags, 'category'),
        planRef: flagStr(flags, 'plan-ref'),
      });
      if (json) {
        console.log(JSON.stringify(rows, null, 2));
        return false;
      }
      if (rows.length === 0) {
        console.log('No roadmap items.');
        return false;
      }
      if (flagBool(flags, 'tree')) {
        const byParent = new Map<number | null, RoadmapRow[]>();
        for (const r of rows) {
          const key = r.parent_id ?? null;
          if (!byParent.has(key)) byParent.set(key, []);
          byParent.get(key)!.push(r);
        }
        const walk = (parent: number | null, indent: string) => {
          for (const r of byParent.get(parent) ?? []) {
            printRoadmapLine(r, indent);
            walk(r.id, indent + '  ');
          }
        };
        walk(null, '');
      } else {
        for (const r of rows) printRoadmapLine(r);
      }
      return false;
    }

    case 'show': {
      const id = Number(positionals[0]);
      if (!Number.isFinite(id)) fail('roadmap show requires a numeric <id>');
      const r = getRoadmap(db, id);
      if (!r) fail(`roadmap #${id} not found`);
      const history = getHistory(db, id);
      if (json) {
        console.log(JSON.stringify({ ...r, history }, null, 2));
        return false;
      }
      const row = r as RoadmapRow;
      printRoadmapLine(row);
      if (row.plan_ref) console.log(`  plan: ${row.plan_ref}`);
      if (row.planned_scope) console.log(`  planned: ${row.planned_scope}`);
      if (row.actual_scope) console.log(`  actual: ${row.actual_scope}`);
      console.log('  history:');
      for (const h of history) {
        console.log(`    ${h.changed_at} ${h.from_status ?? '∅'} -> ${h.to_status}${h.note ? ` (${h.note})` : ''}`);
      }
      return false;
    }

    default:
      fail(`unknown roadmap subcommand '${sub}'. Use add|update|done|list|show`);
  }
}
