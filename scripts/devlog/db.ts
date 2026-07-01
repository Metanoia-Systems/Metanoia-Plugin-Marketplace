/**
 * devlog — local dev-state store (SQLite).
 *
 * Owns the connection, schema, path resolution, and small shared helpers used
 * by the decision / roadmap / snapshot / dashboard command modules.
 *
 * Storage:  .claude/dev-state/devlog.db   (gitignore this in the host project)
 * Snapshot: docs/dev-state/*              (commit this in the host project)
 *
 * PROJECT_ROOT is resolved from process.cwd(), NOT from this file's own
 * location. This script ships inside a Claude Code plugin (installed under
 * something like ~/.claude/plugins/...), so resolving relative to
 * import.meta.url would compute the plugin's own install directory instead
 * of the user's project. Claude Code always invokes hook and skill commands
 * with cwd set to the active project root, so process.cwd() is correct here.
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

export const PROJECT_ROOT = process.cwd();
export const DB_DIR = resolve(PROJECT_ROOT, '.claude', 'dev-state');
export const DB_PATH = resolve(DB_DIR, 'devlog.db');
export const SNAPSHOT_DIR = resolve(PROJECT_ROOT, 'docs', 'dev-state');

export const DECISION_STATUSES = ['proposed', 'accepted', 'superseded', 'deprecated'] as const;
export const ROADMAP_STATUSES = ['planned', 'in_progress', 'blocked', 'done', 'abandoned'] as const;
export const ROADMAP_CATEGORIES = ['feature', 'plan', 'step', 'tech-debt'] as const;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS decisions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL,
  title        TEXT NOT NULL,
  context      TEXT,
  decision     TEXT NOT NULL,
  rationale    TEXT,
  consequences TEXT,
  status       TEXT NOT NULL DEFAULT 'accepted',
  supersedes   INTEGER REFERENCES decisions(id),
  tags         TEXT,
  plan_ref     TEXT,
  author       TEXT
);

CREATE TABLE IF NOT EXISTS roadmap (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT NOT NULL DEFAULT 'feature',
  status         TEXT NOT NULL DEFAULT 'planned',
  priority       TEXT DEFAULT 'medium',
  parent_id      INTEGER REFERENCES roadmap(id),
  plan_ref       TEXT,
  planned_scope  TEXT,
  actual_scope   TEXT,
  variance_notes TEXT,
  blocked_reason TEXT
);

CREATE TABLE IF NOT EXISTS roadmap_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  roadmap_id  INTEGER NOT NULL REFERENCES roadmap(id),
  changed_at  TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_roadmap_status ON roadmap(status);
CREATE INDEX IF NOT EXISTS idx_roadmap_plan_ref ON roadmap(plan_ref);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
`;

/** Open (creating if needed) the devlog DB with schema applied. Idempotent. */
export function openDb(): DatabaseSync {
  mkdirSync(DB_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/* Argument parsing (simple process.argv style, with light flag support). */
/* ------------------------------------------------------------------ */

export type Flags = Record<string, string | boolean>;

export interface ParsedArgs {
  positionals: string[];
  flags: Flags;
}

/** Flags that never consume the following token as their value. */
const BOOLEAN_FLAGS = new Set(['json', 'tree']);

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const body = tok.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      if (BOOLEAN_FLAGS.has(body)) {
        flags[body] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[body] = next;
        i++;
      } else {
        flags[body] = true;
      }
    } else {
      positionals.push(tok);
    }
  }
  return { positionals, flags };
}

export function flagStr(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return typeof v === 'string' ? v : undefined;
}

export function flagBool(flags: Flags, key: string): boolean {
  return flags[key] === true || flags[key] === 'true';
}

export function flagNum(flags: Flags, key: string): number | undefined {
  const v = flagStr(flags, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Print an error and exit non-zero. */
export function fail(message: string): never {
  console.error(`devlog: ${message}`);
  process.exit(1);
}

export function assertOneOf(value: string, allowed: readonly string[], label: string): void {
  if (!allowed.includes(value)) {
    fail(`invalid ${label} '${value}'. Expected one of: ${allowed.join(', ')}`);
  }
}
