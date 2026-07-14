/**
 * Cron Worker - 独立定时调度进程
 *
 * 本地运行模式（SQLite），与 Next.js 应用共享数据库文件。
 * 启动方式：npx tsx src/worker/index.ts
 */

import { getSupabaseAdmin } from "../lib/supabase";
import * as cron from "node-cron";
import path from "path";

// 加载环境变量
import { config } from "dotenv";
config({ path: path.resolve(__dirname, "../../.env.local") });

// ============================================================
// 数据库客户端（SQLite）
// ============================================================
const supabaseAdmin = getSupabaseAdmin();

const TRIGGER_KEY = process.env.TRIGGER_KEY!;
const WORKER_ID = `worker-${process.pid}`;
const API_BASE = process.env.API_BASE || "http://localhost:3000";

// ============================================================
// 类型定义
// ============================================================
interface PushTimeConfig {
  id: number;
  message_type: number;
  robot_id: number | null;
  hour: number;
  minute: number;
  is_active: boolean;
}

interface PreviewConfig {
  enabled: boolean;
  preview_lead_minutes: number;
}

// ============================================================
// 工具函数
// ============================================================
function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logError(msg: string, err: unknown) {
  console.error(`[${new Date().toISOString()}] ERROR: ${msg}`, err);
}

async function updateHeartbeat() {
  try {
    const { error } = await supabaseAdmin
      .from("worker_heartbeat")
      .upsert(
        { id: 1, worker_id: WORKER_ID, last_heartbeat: new Date().toISOString(), status: "running" },
        { onConflict: "id" }
      );
    if (error) logError("心跳更新失败", error);
  } catch (err) {
    logError("心跳异常", err);
  }
}

async function callTrigger(messageType: number, isPreview: boolean = false) {
  const url = `${API_BASE}/api/trigger`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-trigger-key": TRIGGER_KEY,
        ...(isPreview ? { "x-preview": "1" } : {}),
      },
      body: JSON.stringify({ message_type: messageType }),
    });
    const data = await res.json();
    if (res.ok) {
      log(`✅ 推送成功 [类型=${messageType}${isPreview ? ", 预览" : ""}]`);
    } else {
      logError(`推送失败 [类型=${messageType}]: ${data.error}`, null);
    }
    return res.ok;
  } catch (err) {
    logError(`调用trigger失败 [类型=${messageType}]`, err);
    return false;
  }
}

// ============================================================
// 重试逻辑
// 注意: 本 Worker 仅部署 1 个实例，多实例会导致重复推送。
// 如需扩展，请引入分布式锁（如 Supabase advisory lock）。
// ============================================================
const RETRY_DELAYS = [60_000, 300_000, 900_000]; // 1分钟, 5分钟, 15分钟

async function retryFailedPushes() {
  try {
    const { data: failedLogs } = await supabaseAdmin
      .from("push_logs")
      .select("*")
      .eq("status", "failed")
      .lt("retry_count", 3)
      .order("pushed_at", { ascending: false });

    if (!failedLogs?.length) return;

    for (const failedLog of failedLogs) {
      const delay = RETRY_DELAYS[failedLog.retry_count] || RETRY_DELAYS[2];
      log(`重试推送 [ID=${failedLog.id}, 第${failedLog.retry_count + 1}次, ${delay / 1000}秒后]`);

      // 标记为 retrying
      await supabaseAdmin.from("push_logs").update({ status: "retrying" }).eq("id", failedLog.id);

      setTimeout(async () => {
        try {
          // 获取机器人 webhook
          const { data: ptConfig } = await supabaseAdmin
            .from("push_time_config")
            .select("robot_id")
            .eq("message_type", failedLog.message_type)
            .single();

          let webhookUrl: string | null = null;
          if (ptConfig?.robot_id) {
            const { data: robot } = await supabaseAdmin
              .from("robot_config")
              .select("webhook_url")
              .eq("id", ptConfig.robot_id)
              .single();
            webhookUrl = robot?.webhook_url ?? null;
          }

          if (!webhookUrl) {
            await supabaseAdmin.from("push_logs").update({
              status: "failed",
              error_message: "机器人 webhook 不可用",
              completed_at: new Date().toISOString(),
            }).eq("id", failedLog.id);
            return;
          }

          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: failedLog.content }),
          });

          const newRetryCount = failedLog.retry_count + 1;

          if (res.ok) {
            await supabaseAdmin.from("push_logs").update({
              status: "success",
              retry_count: newRetryCount,
              completed_at: new Date().toISOString(),
              error_message: null,
            }).eq("id", failedLog.id);
            log(`✅ 重试成功 [ID=${failedLog.id}]`);
          } else {
            const errText = await res.text();
            await supabaseAdmin.from("push_logs").update({
              status: newRetryCount >= 3 ? "failed" : "retrying",
              retry_count: newRetryCount,
              error_message: errText.slice(0, 500),
              completed_at: newRetryCount >= 3 ? new Date().toISOString() : null,
            }).eq("id", failedLog.id);
            logError(`重试失败 [ID=${failedLog.id}, 第${newRetryCount}次]`, errText.slice(0, 200));
          }
        } catch (err) {
          logError(`重试异常 [ID=${failedLog.id}]`, err);
        }
      }, delay);
    }
  } catch (err) {
    logError("重试查询失败", err);
  }
}

// ============================================================
// 任务调度
// ============================================================
let scheduledJobs: Map<number, { main: cron.ScheduledTask; preview: cron.ScheduledTask | null }> = new Map();

async function loadAndSchedule() {
  log("加载推送配置...");

  // 加载推送时间配置
  const { data: configs } = await supabaseAdmin
    .from("push_time_config")
    .select("*")
    .eq("is_active", true);

  if (!configs?.length) {
    log("⚠️ 没有启用的推送配置，跳过调度");
    return;
  }

  // 加载预览配置
  const { data: previewCfg } = await supabaseAdmin
    .from("preview_config")
    .select("*")
    .limit(1)
    .single();
  const previewConfig: PreviewConfig = (previewCfg as PreviewConfig) || { enabled: false, preview_lead_minutes: 60 };

  // 清除旧调度
  for (const [, jobs] of scheduledJobs) {
    jobs.main.stop();
    jobs.preview?.stop();
  }
  scheduledJobs.clear();

  for (const config of configs as PushTimeConfig[]) {
    if (!config.robot_id) {
      log(`⚠️ 消息类型 ${config.message_type} 未绑定机器人，跳过`);
      continue;
    }

    // 构建 cron 表达式: 分 时 * * *
    const cronExpr = `${config.minute} ${config.hour} * * *`;
    log(`调度 [类型=${config.message_type}]: ${cronExpr}`);

    // 主推送任务
    const mainJob = cron.schedule(cronExpr, async () => {
      log(`🚀 定时触发推送 [类型=${config.message_type}]`);

      // 检查工作日
      const today = new Date();
      const dayOfWeek = today.getDay();

      // 检查节假日
      const todayStr = today.toISOString().split("T")[0];
      const { data: holidays } = await supabaseAdmin
        .from("holidays")
        .select("*")
        .lte("start_date", todayStr)
        .gte("end_date", todayStr);

      if (holidays && holidays.length > 0) {
        log(`⏭️ 跳过推送 [类型=${config.message_type}]: 节假日 (${holidays[0].name})`);
        return;
      }

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        log(`⏭️ 跳过推送 [类型=${config.message_type}]: 周末`);
        return;
      }

      await callTrigger(config.message_type);
    }, { timezone: "Asia/Shanghai" });

    // 预览任务（如果需要）
    let previewJob: cron.ScheduledTask | null = null;
    if (previewConfig.enabled) {
      const leadMinutes = previewConfig.preview_lead_minutes;
      const previewMinute = (config.minute + config.hour * 60 - leadMinutes + 1440) % 1440;
      const previewHour = Math.floor(previewMinute / 60);
      const previewMin = previewMinute % 60;
      const previewCronExpr = `${previewMin} ${previewHour} * * *`;

      log(`  预览调度 [类型=${config.message_type}]: ${previewCronExpr}（提前${leadMinutes}分钟）`);

      previewJob = cron.schedule(previewCronExpr, () => {
        log(`📋 发送预览消息 [类型=${config.message_type}]`);
        callTrigger(config.message_type, true);
      }, { timezone: "Asia/Shanghai" });
    }

    scheduledJobs.set(config.message_type, { main: mainJob, preview: previewJob });
  }
}

// ============================================================
// 主循环
// ============================================================
async function main() {
  log("============================================");
  log("迭代需求群消息自动通知系统 - Cron Worker");
  log("============================================");
  log(`Worker ID: ${WORKER_ID}`);

  // 首次加载前，将卡在 "retrying" 状态的日志恢复为 "failed"
  try {
    const { data: stuckLogs } = await supabaseAdmin
      .from("push_logs")
      .select("id")
      .eq("status", "retrying");

    if (stuckLogs?.length) {
      const ids = stuckLogs.map((l) => l.id);
      await supabaseAdmin
        .from("push_logs")
        .update({ status: "failed" })
        .in("id", ids);
      log(`恢复 ${ids.length} 条卡在 retrying 状态的日志为 failed`);
    }
  } catch (err) {
    logError("恢复retrying状态失败", err);
  }

  // 首次加载
  await loadAndSchedule();

  // 每5分钟更新心跳
  setInterval(updateHeartbeat, 300_000);
  updateHeartbeat();

  // 每30分钟检查重试
  setInterval(retryFailedPushes, 1_800_000);
  retryFailedPushes();

  // 每10分钟重新加载配置（配置变更自动生效）
  setInterval(async () => {
    log("重新加载配置...");
    await loadAndSchedule();
  }, 600_000);

  log("Worker 已就绪，等待定时触发...");
}

// 优雅退出
process.on("SIGINT", () => {
  log("收到 SIGINT，停止所有任务...");
  for (const [, jobs] of scheduledJobs) {
    jobs.main.stop();
    jobs.preview?.stop();
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("收到 SIGTERM，停止所有任务...");
  for (const [, jobs] of scheduledJobs) {
    jobs.main.stop();
    jobs.preview?.stop();
  }
  process.exit(0);
});

main().catch((err) => {
  logError("Worker 启动失败", err);
  process.exit(1);
});
