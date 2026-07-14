/**
 * 数据库种子脚本
 *
 * 初始化本地 SQLite 数据库：
 * 1. 导入发版日历 CSV
 * 2. 插入默认配置（机器人、模板、禅道编号等）
 * 3. 插入 2026 年节假日
 *
 * 运行: npx tsx scripts/seed.ts
 */

import { initDatabase } from "../src/lib/supabase";
import * as fs from "fs";
import * as path from "path";
import * as iconv from "iconv-lite";

// 从环境变量读取敏感配置（避免硬编码泄露）
// 本地开发时在 .env.local 中配置，生产部署时由 CI/CD 注入
const WEBHOOK_URL = process.env.WEBHOOK_URL || "";
const ZENTAO_BASE_URL = process.env.ZENTAO_BASE_URL || "";

const db = initDatabase();

// ============================================================
// 1. 导入发版日历 CSV
// ============================================================

function importCalendar() {
  const csvPath = path.resolve(__dirname, "..", "2026发版日历一张表.csv");
  if (!fs.existsSync(csvPath)) {
    console.log("⚠ 找不到 CSV 文件，跳过日历导入");
    return;
  }

  const buffer = fs.readFileSync(csvPath);
  const text = iconv.decode(buffer, "gbk");
  const lines = text.split("\n").filter((l) => l.trim());

  const records: {
    year: number;
    month: number;
    iteration_number: string;
    release_date: string;
    planning_date: string;
  }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 5) continue;

    const year = parseInt(cols[0], 10);
    const month = parseInt(cols[1], 10);
    const iterationNumber = cols[2].trim();
    const releaseDateStr = cols[3].trim();
    const planningDateStr = cols[4].trim();

    if (isNaN(year) || isNaN(month)) continue;

    // 解析日期
    const parseDate = (val: string, y: number): string => {
      let m: number, d: number;
      if (val.includes("/")) {
        const p = val.split("/");
        m = parseInt(p[0], 10);
        d = parseInt(p[1], 10);
      } else {
        m = parseInt(val.slice(0, 2), 10);
        d = parseInt(val.slice(2, 4), 10);
      }
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };

    let releaseDate = parseDate(releaseDateStr, year);
    let planningDate = parseDate(planningDateStr, year);

    // 跨年校正
    if (planningDate > releaseDate) {
      const pd = new Date(planningDate + "T00:00:00");
      pd.setFullYear(pd.getFullYear() - 1);
      planningDate = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, "0")}-${String(pd.getDate()).padStart(2, "0")}`;
    }

    records.push({ year, month, iteration_number: iterationNumber, release_date: releaseDate, planning_date: planningDate });
  }

  // 去重后插入
  const existing = db
    .prepare(`SELECT iteration_number FROM release_calendar`)
    .all() as { iteration_number: string }[];
  const existingSet = new Set(existing.map((r) => r.iteration_number));
  const toInsert = records.filter((r) => !existingSet.has(r.iteration_number));

  if (toInsert.length === 0) {
    console.log(`📅 日历: 已存在 ${records.length} 条记录，跳过`);
    return;
  }

  const stmt = db.prepare(
    `INSERT INTO release_calendar (year, month, iteration_number, release_date, planning_date)
     VALUES (?, ?, ?, ?, ?)`
  );

  const txn = db.transaction(() => {
    for (const r of toInsert) {
      stmt.run(r.year, r.month, r.iteration_number, r.release_date, r.planning_date);
    }
  });
  txn();

  console.log(`📅 日历: 导入 ${toInsert.length} 条记录`);
}

// ============================================================
// 2. 种子数据
// ============================================================

function seedDefaults() {
  // 机器人配置
  const robotExists = db.prepare(`SELECT id FROM robot_config LIMIT 1`).get();
  if (!robotExists) {
    db.prepare(
      `INSERT INTO robot_config (name, webhook_url, is_active)
       VALUES (?, ?, 1)`
    ).run(
      "群机器人",
      WEBHOOK_URL
    );
    console.log("🤖 机器人: 已配置");
  }

  // 消息模板
  const tmplExists = db.prepare(`SELECT id FROM message_templates LIMIT 1`).get();
  if (!tmplExists) {
    const stmt = db.prepare(
      `INSERT INTO message_templates (message_type, template_content) VALUES (?, ?)`
    );
    stmt.run(
      1,
      "【{发版日日期}联合规划会需求收集提醒】@ALL\n" +
        "{发版日日期}迭代联合规划会计划在{规划会日期}进行，请各位PM提前整理需求，在{规划会日期-2}前在禅道上记录。\n" +
        "禅道需求" + ZENTAO_BASE_URL + "/execution-story-{禅道编号}.html"
    );
    stmt.run(
      2,
      "【{发版日日期}进度更新提醒】@ALL\n" +
        "各位好，{发版日日期}迭代正在进行中，请及时更新禅道需求状态。\n" +
        "禅道：" + ZENTAO_BASE_URL + "/execution-story-{禅道编号}.html"
    );
    stmt.run(
      3,
      "【{发版日日期}发版后状态更新通知】@ALL\n" +
        "{发版日日期}迭代已于{发版日日期-1}发版，请PM在{发版日日期}前完成发版状态更新。\n" +
        "禅道：" + ZENTAO_BASE_URL + "/execution-story-{禅道编号}.html"
    );
    stmt.run(
      4,
      "【{发版日日期}进度更新提醒】@ALL\n" +
        "各位好，{发版日日期}迭代正在进行中，请及时更新禅道需求状态。\n" +
        "禅道：" + ZENTAO_BASE_URL + "/execution-story-{禅道编号}.html"
    );
    console.log("📝 消息模板: 已配置 4 条");
  }

  // 推送时间配置
  const pushExists = db.prepare(`SELECT id FROM push_time_config LIMIT 1`).get();
  if (!pushExists) {
    const stmt = db.prepare(
      `INSERT INTO push_time_config (message_type, robot_id, hour, minute, is_active) VALUES (?, 1, ?, ?, 1)`
    );
    stmt.run(1, 10, 0); // 规划会提醒 10:00
    stmt.run(2, 11, 0); // 进度更新 11:00
    stmt.run(3, 9, 15); // 发版后 09:15
    stmt.run(4, 10, 0); // 部门进度更新 10:00
    console.log("⏰ 推送时间: 已配置 4 条");
  }

  // 禅道编号配置
  const chanzhouExists = db.prepare(`SELECT id FROM chanzhou_config LIMIT 1`).get();
  if (!chanzhouExists) {
    db.prepare(
      `INSERT INTO chanzhou_config (base_iteration, base_chanzhou_num, increment) VALUES (?, ?, ?)`
    ).run("0526", 348, 1);
    console.log("🔢 禅道编号: 已配置 (0526→348)");
  }

  // 节假日（2026年）
  const holidayExists = db.prepare(`SELECT id FROM holidays LIMIT 1`).get();
  if (!holidayExists) {
    const holidays = [
      ["元旦", "2026-01-01", "2026-01-03"],
      ["春节", "2026-02-15", "2026-02-23"],
      ["清明节", "2026-04-04", "2026-04-06"],
      ["劳动节", "2026-05-01", "2026-05-05"],
      ["端午节", "2026-06-19", "2026-06-21"],
      ["中秋节", "2026-09-25", "2026-09-27"],
      ["国庆节", "2026-10-01", "2026-10-07"],
    ];
    const stmt = db.prepare(
      `INSERT INTO holidays (name, start_date, end_date, year) VALUES (?, ?, ?, 2026)`
    );
    for (const [name, start, end] of holidays) {
      stmt.run(name, start, end);
    }
    console.log("🎉 节假日: 已配置 7 条");
  }

  // 预览配置
  const previewExists = db.prepare(`SELECT id FROM preview_config LIMIT 1`).get();
  if (!previewExists) {
    db.prepare(
      `INSERT INTO preview_config (enabled, preview_lead_minutes) VALUES (0, 60)`
    ).run();
    console.log("👁 预览: 已配置（默认关闭）");
  }

  // 系统配置
  const sysExists = db.prepare(`SELECT id FROM system_config LIMIT 1`).get();
  if (!sysExists) {
    db.prepare(
      `INSERT INTO system_config (config_key, config_value, description) VALUES (?, ?, ?)`
    ).run("chanzhou_base_url", ZENTAO_BASE_URL, "禅道基础 URL");
    console.log("⚙ 系统配置: 已配置");
  }
}

// ============================================================
// 主流程
// ============================================================

console.log("🚀 开始初始化数据库...\n");
importCalendar();
seedDefaults();

console.log("\n✅ 数据库初始化完成");
console.log(`📁 数据库文件: ${path.resolve(process.cwd(), "data", "local.db")}`);
