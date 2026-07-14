import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import * as iconv from "iconv-lite";

function checkAuth(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * 解析日期值，支持两种格式：
 * - "M/D" 或 "MM/DD"（如 "12/19"）
 * - "MMDD"（如 "0106"）
 *
 * 返回 yyyy-MM-dd 格式字符串，非法日期返回 null
 */
function parseDateValue(value: string, year: number): string | null {
  value = value.trim();
  if (!value) return null;

  let month: number;
  let day: number;

  if (value.includes("/")) {
    const parts = value.split("/");
    month = parseInt(parts[0], 10);
    day = parseInt(parts[1], 10);
  } else {
    month = parseInt(value.slice(0, 2), 10);
    day = parseInt(value.slice(2, 4), 10);
  }

  if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // 验证实际日历日（如 2/30 非法）
  const testDate = new Date(year, month - 1, day);
  if (testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
    return null;
  }

  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "请上传 CSV 文件" },
        { status: 400 }
      );
    }

    // 文件大小限制 5MB
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "文件大小不能超过 5MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = iconv.decode(buffer, "gbk");

    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV 文件为空或缺少数据行" },
        { status: 400 }
      );
    }

    // 跳过表头行: 年份,月份,迭代编号,发版日期,规划会日期
    const dataLines = lines.slice(1);
    const errors: string[] = [];
    const records: Array<{
      year: number;
      month: number;
      iteration_number: string;
      planning_date: string;
      release_date: string;
    }> = [];

    for (let i = 0; i < dataLines.length; i++) {
      const lineNumber = i + 2; // CSV 中的行号（从 1 开始，跳过表头）
      const line = dataLines[i];
      const cols = line.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1"));

      if (cols.length < 5) {
        errors.push(`第 ${lineNumber} 行: 列数不足`);
        continue;
      }

      const [yearStr, monthStr, iterationNumber, releaseDateStr, planningDateStr] =
        cols;
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      if (isNaN(year) || isNaN(month)) {
        errors.push(`第 ${lineNumber} 行: 年份或月份格式无效`);
        continue;
      }

      if (!iterationNumber) {
        errors.push(`第 ${lineNumber} 行: 迭代编号为空`);
        continue;
      }

      const planningDateRaw = parseDateValue(planningDateStr, year);
      if (!planningDateRaw) {
        errors.push(
          `第 ${lineNumber} 行: 规划会日期格式无效 "${planningDateStr}"`
        );
        continue;
      }

      const releaseDateRaw = parseDateValue(releaseDateStr, year);
      if (!releaseDateRaw) {
        errors.push(
          `第 ${lineNumber} 行: 发版日期格式无效 "${releaseDateStr}"`
        );
        continue;
      }

      // 跨年校正：若规划会日期（同年）晚于发版日，说明规划会在前一年
      let planningDate = planningDateRaw;
      let releaseDate = releaseDateRaw;
      if (planningDateRaw > releaseDateRaw) {
        const pd = new Date(planningDateRaw + "T00:00:00");
        pd.setFullYear(pd.getFullYear() - 1);
        const m = String(pd.getMonth() + 1).padStart(2, "0");
        const d = String(pd.getDate()).padStart(2, "0");
        planningDate = `${pd.getFullYear()}-${m}-${d}`;
      }


      records.push({
        year,
        month,
        iteration_number: iterationNumber,
        planning_date: planningDate,
        release_date: releaseDate,
      });
    }

    if (records.length === 0) {
      return NextResponse.json({ imported: 0, errors });
    }

    // 检查导入批次内是否有重复的迭代编号
    const seenNumbers = new Set<string>();
    const uniqueRecords: typeof records = [];
    for (const record of records) {
      if (seenNumbers.has(record.iteration_number)) {
        errors.push(`迭代编号 "${record.iteration_number}" 在导入文件中重复`);
        continue;
      }
      seenNumbers.add(record.iteration_number);
      uniqueRecords.push(record);
    }

    // 检查数据库中是否已存在相同的迭代编号
    const iterationNumbers = uniqueRecords.map((r) => r.iteration_number);
    const { data: existingRecords, error: queryError } = await supabaseAdmin
      .from("release_calendar")
      .select("iteration_number")
      .in("iteration_number", iterationNumbers);

    if (queryError) {
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    const existingNumbers = new Set(
      (existingRecords || []).map((r: any) => r.iteration_number)
    );

    const toInsert = uniqueRecords.filter((r) => {
      if (existingNumbers.has(r.iteration_number)) {
        errors.push(`迭代编号 "${r.iteration_number}" 已存在于数据库中`);
        return false;
      }
      return true;
    });

    if (toInsert.length === 0) {
      return NextResponse.json({ imported: 0, errors });
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("release_calendar")
      .insert(toInsert)
      .select();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      imported: inserted?.length || 0,
      errors,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
