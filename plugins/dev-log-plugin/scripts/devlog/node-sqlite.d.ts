/**
 * Minimal ambient declaration for Node 24's built-in `node:sqlite`.
 *
 * Consuming projects may pin an `@types/node` version that predates the
 * `node:sqlite` types, which would otherwise fail `tsc --noEmit` type
 * checking. This declares only the surface the devlog CLI uses. Safe to
 * remove once `@types/node` is bumped to >=22.5 in whatever project
 * type-checks this plugin's scripts.
 */
declare module 'node:sqlite' {
  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export interface StatementSync {
    run(...params: unknown[]): StatementResultingChanges;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean; open?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
