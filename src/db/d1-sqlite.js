import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

class D1SQLitePreparedStatement {
  constructor(sqlite, sql, params = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new D1SQLitePreparedStatement(this.sqlite, this.sql, params);
  }

  async run() {
    const info = this.sqlite.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: info.lastInsertRowid === undefined ? undefined : Number(info.lastInsertRowid)
      }
    };
  }

  async all() {
    const results = this.sqlite.prepare(this.sql).all(...this.params);
    return {
      success: true,
      results,
      meta: {
        rows_read: results.length,
        rows_written: 0
      }
    };
  }

  async first(columnName) {
    const row = this.sqlite.prepare(this.sql).get(...this.params);
    if (!row) return null;
    return columnName ? row[columnName] : row;
  }
}

class D1SQLiteDatabase {
  constructor(databasePath) {
    const resolved = resolve(databasePath);
    mkdirSync(dirname(resolved), { recursive: true });
    this.sqlite = new Database(resolved);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
  }

  prepare(sql) {
    return new D1SQLitePreparedStatement(this.sqlite, sql);
  }

  async batch(statements) {
    const transaction = this.sqlite.transaction((items) => {
      return items.map((statement) => {
        const info = this.sqlite.prepare(statement.sql).run(...statement.params);
        return {
          success: true,
          meta: {
            changes: info.changes,
            last_row_id: info.lastInsertRowid === undefined ? undefined : Number(info.lastInsertRowid)
          }
        };
      });
    });
    return transaction(statements);
  }

  async exec(sql) {
    this.sqlite.exec(sql);
    return { success: true };
  }

  close() {
    this.sqlite.close();
  }
}

export function createD1Database(databasePath) {
  return new D1SQLiteDatabase(databasePath);
}

export { D1SQLiteDatabase, D1SQLitePreparedStatement };
