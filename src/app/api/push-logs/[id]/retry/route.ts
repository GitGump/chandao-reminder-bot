import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabaseAdmin = getSupabaseAdmin();
  if (request.headers.get("x-api-key") !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const logId = parseInt(id, 10);

  if (isNaN(logId)) {
    return NextResponse.json({ error: "无效的 ID" }, { status: 400 });
  }

  // 1. Get the log by id
  const { data: log, error: logError } = await supabaseAdmin
    .from("push_logs")
    .select("*")
    .eq("id", logId)
    .single();

  if (logError || !log) {
    return NextResponse.json({ error: "Log not found" }, { status: 404 });
  }

  // 2. Check status is 'failed'
  if (log.status !== "failed") {
    return NextResponse.json(
      { error: "只能重试失败的推送" },
      { status: 400 }
    );
  }

  // 3. Check retry count limit (max 3 retries)
  if ((log.retry_count ?? 0) >= 3) {
    return NextResponse.json(
      { error: "已达最大重试次数（3次），无法继续重试" },
      { status: 400 }
    );
  }

  // 3. Get the robot for this message_type from push_time_config + robot_config
  const { data: pushConfig } = await supabaseAdmin
    .from("push_time_config")
    .select("robot_id")
    .eq("message_type", log.message_type)
    .single();

  let webhookUrl: string | null = null;

  if (pushConfig?.robot_id) {
    const { data: robot } = await supabaseAdmin
      .from("robot_config")
      .select("webhook_url")
      .eq("id", pushConfig.robot_id)
      .single();

    webhookUrl = robot?.webhook_url ?? null;
  }

  if (!webhookUrl) {
    return NextResponse.json(
      { error: "No robot webhook URL configured for this message type" },
      { status: 400 }
    );
  }

  // 4. POST to robot's webhook_url
  let retrySuccess = false;
  let retryError = "";

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: log.content }),
    });

    if (response.ok) {
      retrySuccess = true;
    } else {
      retryError = `Webhook responded with status ${response.status}: ${await response.text().catch(() => "Unknown error")}`;
    }
  } catch (err) {
    retryError = err instanceof Error ? err.message : "Unknown network error";
  }

  // 5. Update log
  const completedAt = new Date().toISOString();

  if (retrySuccess) {
    await supabaseAdmin
      .from("push_logs")
      .update({
        status: "success",
        completed_at: completedAt,
        retry_count: (log.retry_count ?? 0) + 1,
        error_message: null,
      })
      .eq("id", logId);
  } else {
    await supabaseAdmin
      .from("push_logs")
      .update({
        status: "failed",
        error_message: retryError.slice(0, 500),
        retry_count: (log.retry_count ?? 0) + 1,
        completed_at: completedAt,
      })
      .eq("id", logId);
  }

  // 6. Return result
  return NextResponse.json({
    success: retrySuccess,
    message: retrySuccess ? "Retry succeeded" : `Retry failed: ${retryError}`,
  });
}
