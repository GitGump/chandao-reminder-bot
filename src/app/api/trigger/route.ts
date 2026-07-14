import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { format, addDays, subDays } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "Asia/Shanghai";

function toDateOnly(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getWeekday(d: Date): string {
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return days[d.getDay()];
}

function replacePlaceholders(
  template: string,
  releaseDate: Date,
  planningDate: Date,
  chanzhouNum: number
): string {
  // {禅道编号} and {禅道编号+N} / {禅道编号-N}
  let result = template.replace(/\{禅道编号(\+|-)(\d+)\}/g, (_, op, numStr) => {
    const n = parseInt(numStr, 10);
    return String(op === "+" ? chanzhouNum + n : chanzhouNum - n);
  });
  result = result.replace(/\{禅道编号\}/g, String(chanzhouNum));

  // {发版日日期} and {发版日日期+N} / {发版日日期-N}
  result = result.replace(/\{发版日日期([+-])(\d+)\}/g, (_, op, numStr) => {
    const n = parseInt(numStr, 10);
    const target = op === "+" ? addDays(releaseDate, n) : subDays(releaseDate, n);
    return toDateOnly(target);
  });

  // {规划会日期+N} / {规划会日期-N}
  result = result.replace(/\{规划会日期([+-])(\d+)\}/g, (_, op, numStr) => {
    const n = parseInt(numStr, 10);
    const target = op === "+" ? addDays(planningDate, n) : subDays(planningDate, n);
    return toDateOnly(target);
  });

  // {发版日日期所在星期}
  result = result.replace(/\{发版日日期所在星期\}/g, getWeekday(releaseDate));
  // {规划会日期所在星期}
  result = result.replace(/\{规划会日期所在星期\}/g, getWeekday(planningDate));

  // {发版日日期}
  result = result.replace(/\{发版日日期\}/g, toDateOnly(releaseDate));
  // {规划会日期}
  result = result.replace(/\{规划会日期\}/g, toDateOnly(planningDate));

  return result;
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    // Auth check
    const triggerKey = request.headers.get("x-trigger-key");
    if (!triggerKey || triggerKey !== process.env.TRIGGER_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message_type, iteration_number, push_source } = body as {
      message_type: number;
      iteration_number?: string;
      push_source?: string;
    };

    if (!message_type || ![1, 2, 3, 4].includes(message_type)) {
      return NextResponse.json(
        { error: "Invalid message_type" },
        { status: 400 }
      );
    }

    // 1. Get push_time_config for this message_type
    const { data: pushConfig, error: pushConfigError } = await supabaseAdmin
      .from("push_time_config")
      .select("id, robot_id")
      .eq("message_type", message_type)
      .eq("is_active", true)
      .single();

    if (pushConfigError || !pushConfig) {
      return NextResponse.json(
        { error: "Push time config not found or inactive" },
        { status: 404 }
      );
    }

    if (!pushConfig.robot_id) {
      return NextResponse.json(
        { error: "No robot configured for this message type" },
        { status: 400 }
      );
    }

    // 2. Get the robot webhook_url
    const { data: robot, error: robotError } = await supabaseAdmin
      .from("robot_config")
      .select("webhook_url")
      .eq("id", pushConfig.robot_id)
      .single();

    if (robotError || !robot) {
      return NextResponse.json({ error: "Robot not found" }, { status: 404 });
    }

    // 3. Determine iteration
    let iteration: Record<string, any> | null = null;

    const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");

    if (iteration_number) {
      // Use specific iteration
      const { data: specificIter } = await supabaseAdmin
        .from("release_calendar")
        .select("iteration_number, planning_date, release_date")
        .eq("iteration_number", iteration_number)
        .single();

      iteration = specificIter;
    } else {
      if (message_type === 1) {
        // 规划会提醒: 找下一个 planning_date >= today 的迭代
        const { data: nextPlannings } = await supabaseAdmin
          .from("release_calendar")
          .select("iteration_number, planning_date, release_date")
          .gte("planning_date", today)
          .order("planning_date", { ascending: true })
          .limit(1);

        if (nextPlannings && nextPlannings.length > 0) {
          iteration = nextPlannings[0];
        } else {
          // 没有将来的 planning_date，用最近的
          const { data: lastIter } = await supabaseAdmin
            .from("release_calendar")
            .select("iteration_number, planning_date, release_date")
            .order("planning_date", { ascending: false })
            .limit(1);
          iteration = lastIter?.[0] ?? null;
        }
      } else if (message_type === 3) {
        // 发版后状态更新: 找最近已发版的迭代 (release_date <= today)
        const { data: recentReleases } = await supabaseAdmin
          .from("release_calendar")
          .select("iteration_number, planning_date, release_date")
          .lte("release_date", today)
          .order("release_date", { ascending: false })
          .limit(1);

        if (recentReleases && recentReleases.length > 0) {
          iteration = recentReleases[0];
        } else {
          // 没有已发版的，回退到当前活跃迭代
          const { data: currentIters } = await supabaseAdmin
            .from("release_calendar")
            .select("iteration_number, planning_date, release_date")
            .lte("planning_date", today)
            .gte("release_date", today)
            .order("planning_date", { ascending: false })
            .limit(1);
          iteration = currentIters?.[0] ?? null;
        }
      } else {
        // 类型2/4: 当前活跃迭代（进度更新）
        const { data: currentIters } = await supabaseAdmin
          .from("release_calendar")
          .select("iteration_number, planning_date, release_date")
          .lte("planning_date", today)
          .gte("release_date", today)
          .order("planning_date", { ascending: false })
          .limit(1);

        if (currentIters && currentIters.length > 0) {
          iteration = currentIters[0];
        } else {
          // Fallback: pick the most recent iteration with release_date <= today
          const { data: pastIters } = await supabaseAdmin
            .from("release_calendar")
            .select("iteration_number, planning_date, release_date")
            .lte("release_date", today)
            .order("release_date", { ascending: false })
            .limit(1);

          if (pastIters && pastIters.length > 0) {
            iteration = pastIters[0];
          }
        }
      }
    }

    if (!iteration) {
      return NextResponse.json(
        { error: "No matching iteration found" },
        { status: 404 }
      );
    }

    const releaseDate = new Date(iteration.release_date + "T00:00:00");
    const planningDate = new Date(iteration.planning_date + "T00:00:00");

    // 4. Get template
    const { data: template, error: templateError } = await supabaseAdmin
      .from("message_templates")
      .select("template_content")
      .eq("message_type", message_type)
      .single();

    if (templateError || !template || !template.template_content?.trim()) {
      return NextResponse.json(
        { error: "模板未找到或内容为空" },
        { status: 404 }
      );
    }

    // 5. Get chanzhou_config and calculate chanzhou number
    const { data: chanzhouConfig, error: ccError } = await supabaseAdmin
      .from("chanzhou_config")
      .select("base_iteration, base_chanzhou_num, increment")
      .single();

    if (ccError || !chanzhouConfig) {
      return NextResponse.json(
        { error: "Chanzhou config not found" },
        { status: 404 }
      );
    }

    // Get all iterations ordered by planning_date (limit 500)
    const { data: allIterations, error: allIterError } = await supabaseAdmin
      .from("release_calendar")
      .select("iteration_number")
      .order("planning_date", { ascending: true })
      .limit(500);

    if (allIterError || !allIterations) {
      return NextResponse.json(
        { error: "Failed to load release calendar" },
        { status: 500 }
      );
    }

    const baseIndex = allIterations.findIndex(
      (it) => it.iteration_number === chanzhouConfig.base_iteration
    );
    const currentIndex = allIterations.findIndex(
      (it) => it.iteration_number === iteration.iteration_number
    );

    if (baseIndex === -1) {
      return NextResponse.json(
        { error: `Base iteration ${chanzhouConfig.base_iteration} not found in calendar` },
        { status: 500 }
      );
    }

    if (currentIndex === -1) {
      return NextResponse.json(
        { error: `Current iteration ${iteration.iteration_number} not found in calendar` },
        { status: 500 }
      );
    }

    const chanzhouNum =
      chanzhouConfig.base_chanzhou_num +
      (currentIndex - baseIndex) * chanzhouConfig.increment;

    if (chanzhouNum < 0) {
      return NextResponse.json(
        { error: `计算的禅道编号为负数 (${chanzhouNum})，请检查禅道配置` },
        { status: 500 }
      );
    }

    // 6. Replace placeholders
    const content = replacePlaceholders(
      template.template_content,
      releaseDate,
      planningDate,
      chanzhouNum
    );

    // 7. Get @members for this message_type
    const { data: members } = await supabaseAdmin
      .from("members")
      .select("member_name, userid")
      .eq("message_type", message_type);

    // 8. Build final message with @ mentions
    let messageContent = content;
    if (members && members.length > 0) {
      const mentionStr = members
        .map((m) => `@${m.userid || m.member_name}`)
        .join(" ");
      // Check if template already contains @ALL
      if (content.includes("@ALL")) {
        messageContent = content;
      } else {
        messageContent = `${content} ${mentionStr}`;
      }
    }

    // 9. POST to webhook
    let status = "success";
    let errorMessage: string | null = null;

    try {
      const webhookRes = await fetch(robot.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageContent }),
      });

      if (!webhookRes.ok) {
        status = "failed";
        const errBody = await webhookRes.text().catch(() => "");
        errorMessage = `Webhook returned ${webhookRes.status}: ${errBody}`;
      }
    } catch (fetchErr) {
      status = "failed";
      errorMessage = fetchErr instanceof Error ? fetchErr.message : "Fetch failed";
    }

    // 10. Record push_log
    const { error: logError } = await supabaseAdmin.from("push_logs").insert({
      message_type,
      iteration_number: iteration.iteration_number,
      content: messageContent,
      status,
      error_message: errorMessage,
      push_source: push_source || "auto",
      pushed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    if (logError) {
      console.error("Failed to record push_log:", logError);
    }

    // 11. Return response
    return NextResponse.json({
      success: status === "success",
      content: messageContent,
      iteration: iteration.iteration_number,
      chanzhou_num: chanzhouNum,
    });
  } catch (err) {
    console.error("Trigger error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
