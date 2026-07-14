import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { format, addDays, isWeekend } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "Asia/Shanghai";

function isHoliday(date: Date, holidayDates: Set<string>): boolean {
  const dateStr = format(date, "yyyy-MM-dd");
  return holidayDates.has(dateStr);
}

function getNextWorkingDay(date: Date, holidayDates: Set<string>): Date {
  let current = date;
  for (let i = 0; i < 30; i++) {
    if (!isWeekend(current) && !isHoliday(current, holidayDates)) {
      return current;
    }
    current = addDays(current, 1);
  }
  // 兜底：30天内未找到工作日，返回推进30天后的日期
  return addDays(date, 30);
}

export async function GET(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (request.headers.get("x-api-key") !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  async function getHolidayDates(): Promise<string[]> {
    const { data } = await supabaseAdmin
      .from("holidays")
      .select("start_date, end_date");

    if (!data?.length) return [];

    const dates: string[] = [];
    for (const h of data as { start_date: string; end_date: string }[]) {
      let d = new Date(h.start_date + "T00:00:00");
      const end = new Date(h.end_date + "T00:00:00");
      while (d <= end) {
        dates.push(format(d, "yyyy-MM-dd"));
        d = addDays(d, 1);
      }
    }
    return dates;
  }

  const holidayDates = new Set(await getHolidayDates());
  const today = toZonedTime(new Date(), TIMEZONE);
  today.setHours(0, 0, 0, 0);

  // Fetch all push time configs
  const { data: configs } = await supabaseAdmin
    .from("push_time_config")
    .select("*");

  // Fetch all release calendar entries
  const { data: calendars } = await supabaseAdmin
    .from("release_calendar")
    .select("*");

  const rawConfigs = configs ?? [];
  const rawCalendars = (calendars ?? []) as { iteration_number: string; planning_date: string; release_date: string }[];
  const messageTypes = [1, 2, 3, 4];
  const results = [];

  for (const messageType of messageTypes) {
    const config = rawConfigs.find((c) => (c as Record<string, unknown>).message_type === messageType) as Record<string, unknown> | undefined;

    if (!config || !config.is_active) {
      results.push({
        message_type: messageType,
        next_time: null,
        iteration: "",
      });
      continue;
    }

    // Find current iteration
    let iteration: { iteration_number: string; planning_date: string; release_date: string } | null = null;

    if (rawCalendars.length > 0) {
      const activeIterations = rawCalendars.filter(
        (c) => {
          const planning = new Date(c.planning_date);
          planning.setHours(0, 0, 0, 0);
          const release = new Date(c.release_date);
          release.setHours(0, 0, 0, 0);
          return planning <= today && today <= release;
        }
      );

      if (activeIterations.length > 0) {
        // Pick the one with latest planning_date
        activeIterations.sort(
          (a, b) =>
            new Date(b.planning_date).getTime() - new Date(a.planning_date).getTime()
        );
        iteration = activeIterations[0];
      } else {
        // Pick the one with most recent release_date
        const sorted = [...rawCalendars].sort(
          (a, b) =>
            new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
        );
        iteration = sorted[0];
      }
    }

    if (!iteration) {
      results.push({
        message_type: messageType,
        next_time: null,
        iteration: "",
      });
      continue;
    }

    // Determine target date based on message type
    let targetDate: Date;
    let targetIteration = iteration;

    if (messageType === 1) {
      // 规划会提醒: 找下一个 planning_date >= today 的迭代
      if (rawCalendars.length > 0) {
        // 按 planning_date 排序，找 planning_date >= today 的第一个
        const sortedByPlanning = [...rawCalendars].sort(
          (a, b) =>
            new Date(a.planning_date).getTime() - new Date(b.planning_date).getTime()
        );
        const nextPlanning = sortedByPlanning.find((c) => {
          const pd = new Date(c.planning_date);
          pd.setHours(0, 0, 0, 0);
          return pd >= today;
        });
        if (nextPlanning) {
          targetIteration = nextPlanning;
          targetDate = new Date(nextPlanning.planning_date);
          targetDate.setHours(0, 0, 0, 0);
        } else {
          // 所有 planning_date 都过去了，用最后一个迭代
          targetDate = new Date(iteration.planning_date);
          targetDate.setHours(0, 0, 0, 0);
        }
      } else {
        targetDate = new Date(iteration.planning_date);
        targetDate.setHours(0, 0, 0, 0);
      }
    } else if (messageType === 2 || messageType === 4) {
      // 进度更新提醒: use today's date
      targetDate = new Date(today);
    } else {
      // 发版后状态更新提醒: 找最近已发版的迭代 (release_date <= today)
      if (rawCalendars.length > 0) {
        const sortedByRelease = [...rawCalendars].sort(
          (a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
        );
        const recentRelease = sortedByRelease.find((c) => {
          const rd = new Date(c.release_date);
          rd.setHours(0, 0, 0, 0);
          return rd <= today;
        });
        if (recentRelease) {
          targetIteration = recentRelease;
          iteration = recentRelease;
        }
      }
      targetDate = addDays(new Date(iteration.release_date), 1);
      targetDate.setHours(0, 0, 0, 0);
    }

    // Apply holiday/weekend adjustment
    targetDate = getNextWorkingDay(targetDate, holidayDates);

    // Combine with hour:minute from config
    targetDate.setHours(Number(config.hour ?? 0), Number(config.minute ?? 0), 0, 0);

    const nextPushTime = format(targetDate, "yyyy/MM/dd HH:mm");

    results.push({
      message_type: messageType,
      next_time: nextPushTime,
      iteration: targetIteration.iteration_number,
    });
  }

  return NextResponse.json(results);
}
