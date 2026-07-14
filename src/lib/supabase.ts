/**
 * SQLite Supabase 兼容层
 *
 * 用 better-sqlite3 模拟 Supabase JS 客户端的查询构建器接口，
 * 使所有 API route 无需修改即可本地运行。
 */
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "data", "local.db");

// 单例数据库连接
let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
  }
  return _db;
}

// ============================================================
// SQL Builder
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** 归一化 SQLite 值（boolean → int） */
function normValue(v: unknown): unknown {
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

function normValues(vals: unknown[]): unknown[] {
  return vals.map(normValue);
}

class QueryBuilder {
  private table: string;
  private op: "select" | "insert" | "update" | "delete" | "upsert";
  private columns = "*";
  private conditions: { clause: string; params: unknown[] }[] = [];
  private orderBy = "";
  private limitCount = 0;
  private insertData: Row[] = [];
  private updateData: Row = {};
  private upsertConflict = "";
  private countExact = false;
  private selectCols: string[] | null = null;

  constructor(table: string) {
    this.table = table;
    this.op = "select";
  }

  // ---- 选择 ----
  select(columns?: string, opts?: { count?: string }) {
    const cols = columns || "*";
    if (cols === "*" && opts?.count === "exact") {
      this.countExact = true;
      this.columns = "*";
    } else if (typeof cols === "string" && cols.startsWith("*,")) {
      // join: "*, robot_config(name)" → ignore join, just "*"
      this.columns = "*";
    } else {
      this.columns = cols;
      // 解析出实际列名
      this.selectCols = cols
        .split(",")
        .map((c) => c.trim())
        .filter((c) => !c.includes("("));
    }
    return this;
  }

  // ---- 条件 ----
  eq(col: string, val: unknown) {
    this.conditions.push({ clause: `"${col}" = ?`, params: [val] });
    return this;
  }
  in(col: string, vals: unknown[]) {
    const ph = vals.map(() => "?").join(",");
    this.conditions.push({ clause: `"${col}" IN (${ph})`, params: vals });
    return this;
  }
  lte(col: string, val: unknown) {
    this.conditions.push({ clause: `"${col}" <= ?`, params: [val] });
    return this;
  }
  gte(col: string, val: unknown) {
    this.conditions.push({ clause: `"${col}" >= ?`, params: [val] });
    return this;
  }
  lt(col: string, val: unknown) {
    this.conditions.push({ clause: `"${col}" < ?`, params: [val] });
    return this;
  }

  // ---- 排序 ----
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const dir = opts?.ascending === false ? "DESC" : "ASC";
    if (this.orderBy) this.orderBy += ", ";
    this.orderBy += `"${col}" ${dir}`;
    return this;
  }

  // ---- 限制 ----
  limit(n: number) {
    this.limitCount = n;
    return this;
  }

  // ---- 写入 ----
  insert(data: Row | Row[]) {
    this.op = "insert";
    this.insertData = Array.isArray(data) ? data : [data];
    return this;
  }
  update(data: Row) {
    this.op = "update";
    this.updateData = data;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  upsert(data: Row, opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.insertData = [data];
    this.upsertConflict = opts?.onConflict || "id";
    return this;
  }

  // ============ 执行 ============

  /** 返回单行，没找到报错 */
  async single(_col?: string): Promise<{ data: Row | null; error: { message: string } | null }> {
    try {
      const result = this.syncExec<Row[]>();
      const rows = result.data;
      if (!rows) {
        return { data: null, error: { message: "No rows found" } };
      }
      if (Array.isArray(rows)) {
        return rows.length > 0 ? { data: rows[0], error: null } : { data: null, error: { message: "No rows found" } };
      }
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  }

  /** 返回单行或 null，不报错 */
  async maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }> {
    try {
      const result = this.syncExec<Row[]>();
      const rows = result.data;
      if (!rows) return { data: null, error: null };
      if (Array.isArray(rows)) {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  }

  /** 执行查询，返回兼容 Supabase 格式 */
  then(
    resolve: (value: { data: Row[]; error: { message: string } | null; count?: number }) => void,
    reject: (err: unknown) => void
  ) {
    try {
      const result = this.syncExec<Row[]>();
      // Ensure data is always an array for then()
      const data = Array.isArray(result.data) ? result.data : [result.data].filter(Boolean);
      resolve({ data, error: null, count: result.count });
    } catch (err) {
      reject(err);
    }
  }

  // ---- 内部同步执行 ----
  private syncExec<T extends Row[] | Row>(): { data: T; error: null; count?: number } {
    if (this.op === "insert") return this.execInsert<T>();
    if (this.op === "update") return this.execUpdate<T>();
    if (this.op === "delete") return this.execDelete<T>();
    if (this.op === "upsert") return this.execUpsert<T>();
    return this.execSelect<T>();
  }

  private buildWhere(): { sql: string; params: unknown[] } {
    if (this.conditions.length === 0) return { sql: "", params: [] };
    const clauses = this.conditions.map((c) => c.clause);
    const params = this.conditions.flatMap((c) => c.params);
    return { sql: ` WHERE ${clauses.join(" AND ")}`, params: normValues(params) };
  }

  private execSelect<T>(): { data: T; error: null; count?: number } {
    const db = getDb();
    const { sql: where, params } = this.buildWhere();
    let sql = `SELECT ${this.columns} FROM "${this.table}"${where}`;
    if (this.orderBy) sql += ` ORDER BY ${this.orderBy}`;
    if (this.limitCount) sql += ` LIMIT ${this.limitCount}`;

    const rows = db.prepare(sql).all(...params);
    const result: { data: T; error: null; count?: number } = {
      data: rows as unknown as T,
      error: null,
    };

    if (this.countExact) {
      const countSql = `SELECT COUNT(*) as count FROM "${this.table}"${where}`;
      result.count = (db.prepare(countSql).get(...params) as { count: number }).count;
    }

    return result;
  }

  private execInsert<T>(): { data: T; error: null } {
    const db = getDb();
    if (this.insertData.length === 0) {
      return { data: [] as unknown as T, error: null };
    }

    // 获取插入列
    const keys = Object.keys(this.insertData[0]);
    const cols = keys.map((k) => `"${k}"`).join(", ");
    const placeholders = keys.map(() => "?").join(", ");

    const insertedIds: number[] = [];
    const insertStmt = db.prepare(
      `INSERT INTO "${this.table}" (${cols}) VALUES (${placeholders})`
    );

    const txn = db.transaction(() => {
      for (const row of this.insertData) {
        const info = insertStmt.run(...normValues(keys.map((k) => row[k])));
        insertedIds.push(Number(info.lastInsertRowid));
      }
    });
    txn();

    // select 需要返回
    if (this.selectCols === null) {
      // 不需要 select（trigger 中的 push_logs insert）
      return { data: [] as unknown as T, error: null };
    }

    if (this.insertData.length === 1) {
      const row = db
        .prepare(
          `SELECT ${this.columns} FROM "${this.table}" WHERE id = ?`
        )
        .get(insertedIds[0]);
      return { data: row as unknown as T, error: null };
    }

    const rows = db
      .prepare(
        `SELECT ${this.columns} FROM "${this.table}" WHERE id IN (${insertedIds.join(",")})`
      )
      .all();
    return { data: rows as unknown as T, error: null };
  }

  private execUpdate<T>(): { data: T; error: null } {
    const db = getDb();
    const keys = Object.keys(this.updateData);
    const sets = keys.map((k) => `"${k}" = ?`).join(", ");
    const setParams = normValues(keys.map((k) => this.updateData[k]));
    const { sql: where, params } = this.buildWhere();

    const sql = `UPDATE "${this.table}" SET ${sets}${where}`;
    db.prepare(sql).run(...setParams, ...params);

    // select 返回
    if (this.selectCols === null) {
      return { data: [] as unknown as T, error: null };
    }

    const selectSql = `SELECT ${this.columns} FROM "${this.table}"${where}`;
    const rows = db.prepare(selectSql).all(...params);
    if (rows.length === 1) {
      return { data: rows[0] as unknown as T, error: null };
    }
    return { data: rows as unknown as T, error: null };
  }

  private execDelete<T>(): { data: T; error: null } {
    const db = getDb();
    const { sql: where, params } = this.buildWhere();
    db.prepare(`DELETE FROM "${this.table}"${where}`).run(...params);
    return { data: [] as unknown as T, error: null };
  }

  private execUpsert<T>(): { data: T; error: null } {
    const db = getDb();
    if (this.insertData.length === 0) {
      return { data: [] as unknown as T, error: null };
    }
    const row = this.insertData[0];
    const keys = Object.keys(row);
    const cols = keys.map((k) => `"${k}"`).join(", ");
    const placeholders = keys.map(() => "?").join(", ");
    const vals = normValues(keys.map((k) => row[k]));

    // INSERT ON CONFLICT
    const conflictCol = this.upsertConflict;
    const updates = keys
      .filter((k) => k !== conflictCol)
      .map((k) => `"${k}" = excluded."${k}"`)
      .join(", ");

    db.prepare(
      `INSERT INTO "${this.table}" (${cols}) VALUES (${placeholders})
       ON CONFLICT("${conflictCol}") DO UPDATE SET ${updates}`
    ).run(...vals);

    // Return the upserted row
    if (this.selectCols === null) {
      return { data: [] as unknown as T, error: null };
    }

    const { sql: where, params: whereParams } = this.buildWhere();
    if (where) {
      const sql = `SELECT ${this.columns} FROM "${this.table}"${where} LIMIT 1`;
      const r = db.prepare(sql).all(...whereParams);
      return { data: (r[0] || null) as unknown as T, error: null };
    }

    const r = db
      .prepare(`SELECT ${this.columns} FROM "${this.table}" WHERE "${conflictCol}" = ?`)
      .get(row[conflictCol] as number);
    return { data: (r || null) as unknown as T, error: null };
  }
}

// ============================================================
// 模拟 Supabase 客户端
// ============================================================

function createClient() {
  // 确保表已初始化
  ensureTables();

  return {
    from(table: string) {
      return new QueryBuilder(table);
    },
  };
}

// ============================================================
// 自动建表
// ============================================================

let tablesInitialized = false;

function ensureTables() {
  if (tablesInitialized) return;
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS release_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      iteration_number TEXT NOT NULL,
      release_date TEXT NOT NULL,
      planning_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS robot_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      webhook_url TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_type INTEGER NOT NULL UNIQUE,
      template_content TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS push_time_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_type INTEGER NOT NULL UNIQUE,
      robot_id INTEGER REFERENCES robot_config(id),
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chanzhou_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_iteration TEXT NOT NULL,
      base_chanzhou_num INTEGER NOT NULL,
      increment INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_type INTEGER NOT NULL,
      member_name TEXT NOT NULL,
      userid TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS push_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_type INTEGER NOT NULL,
      iteration_number TEXT,
      content TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      push_source TEXT DEFAULT 'auto',
      pushed_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS preview_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enabled INTEGER DEFAULT 0,
      preview_lead_minutes INTEGER DEFAULT 60,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      year INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT NOT NULL UNIQUE,
      config_value TEXT,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS worker_heartbeat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id TEXT,
      last_heartbeat TEXT,
      status TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 安全迁移：为旧数据库添加 push_source 列（忽略已存在的错误）
  try {
    db.exec("ALTER TABLE push_logs ADD COLUMN push_source TEXT DEFAULT 'auto'");
  } catch (e) {
    // 列已存在则忽略
  }

  tablesInitialized = true;
}

// ============================================================
// 导出（保持与原 supabase.ts 完全一致的接口）
// ============================================================

export function getSupabase() {
  return createClient();
}

export function getSupabaseAdmin() {
  return createClient();
}

/** 初始化数据库并可选导入种子数据 */
export function initDatabase() {
  ensureTables();
  return getDb();
}
