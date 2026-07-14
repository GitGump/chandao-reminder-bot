import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { format, addDays, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

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
  let result = template.replace(/\{禅道编号(\+|-)(\d+)\}/g, (_, op, numStr) => {
    const n = parseInt(numStr, 10);
    return String(op === "+" ? chanzhouNum + n : chanzhouNum - n);
  });
  result = result.replace(/\{禅道编号\}/g, String(chanzhouNum));

  result = result.replace(/\{发版日日期([+-])(\d+)\}/g, (_, op, numStr) => {
    const n = parseInt(numStr, 10);
    const target = op === "+" ? addDays(releaseDate, n) : subDays(releaseDate, n);
    return toDateOnly(target);
  });

  result = result.replace(/\{规划会日期([+-])(\d+)\}/g, (_, op, numStr) => {
    const n = parseInt(numStr, 10);
    const target = op === "+" ? addDays(planningDate, n) : subDays(planningDate, n);
    return toDateOnly(target);
  });

  result = result.replace(/\{发版日日期所在星期\}/g, getWeekday(releaseDate));
  result = result.replace(/\{规划会日期所在星期\}/g, getWeekday(planningDate));

  result = result.replace(/\{发版日日期\}/g, toDateOnly(releaseDate));
  result = result.replace(/\{规划会日期\}/g, toDateOnly(planningDate));

  return result;
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    // Auth check - use x-api-key for manual trigger
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message_type, iteration_number } = body as {
      message_type: number;
      iteration_number?: string;
    };

    if (!message_type || ![1, 2, 3].includes(message_type)) {
      return NextResponse.json(
        { error: "Invalid message_type" },
        { status: 400 }
      );
    }

    const today = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");

    // Auto-detect iteration if not provided
    let iteration: Record<string, any> | null = null;

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
        // 类型2: 当前活跃迭代
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

    // Get template
    const { data: template, error: templateError } = await supabaseAdmin
      .from("message_templates")
      .select("template_content")
      .eq("message_type", message_type)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Get chanzhou_config and calculate chanzhou number
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

    const { data: allIterations, error: allIterError } = await supabaseAdmin
      .from("release_calendar")
      .select("iteration_number")
      .order("planning_date", { ascending: true });

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

    if (baseIndex === -1 || currentIndex === -1) {
      return NextResponse.json(
        { error: "Iteration index not found" },
        { status: 500 }
      );
    }

    const chanzhouNum =
      chanzhouConfig.base_chanzhou_num +
      (currentIndex - baseIndex) * chanzhouConfig.increment;

    // Replace placeholders
    const renderedContent = replacePlaceholders(
      template.template_content,
      releaseDate,
      planningDate,
      chanzhouNum
    );

    // Get @members for this message_type
    const { data: members } = await supabaseAdmin
      .from("members")
      .select("member_name, userid")
      .eq("message_type", message_type);

    // Build preview content with @ mentions
    let previewContent = renderedContent;
    if (members && members.length > 0) {
      const mentionStr = members
        .map((m) => `@${m.userid}`)
        .join(" ");
      if (!renderedContent.includes("@ALL")) {
        previewContent = `${renderedContent} ${mentionStr}`;
      }
    }

    // Return preview only - no actual send, no push_log
    return NextResponse.json({
      content: previewContent,
      iteration: iteration.iteration_number,
      chanzhou_num: chanzhouNum,
    });
  } catch (err) {
    console.error("Manual trigger error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
