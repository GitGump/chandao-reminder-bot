import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

function checkAuth(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");

    let query = supabaseAdmin
      .from("release_calendar")
      .select("*")
      .order("planning_date", { ascending: true });

    if (year) {
      query = query.eq("year", parseInt(year, 10));
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { year, month, iteration_number, planning_date, release_date } = body;

    if (!year || !month || !iteration_number || !planning_date || !release_date) {
      return NextResponse.json(
        { error: "缺少必填字段" },
        { status: 400 }
      );
    }

    // 检查迭代编号唯一性
    const { data: existing, error: checkError } = await supabaseAdmin
      .from("release_calendar")
      .select("id")
      .eq("iteration_number", iteration_number)
      .maybeSingle();

    if (checkError) {
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json(
        { error: `迭代编号 "${iteration_number}" 已存在` },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("release_calendar")
      .insert({
        year,
        month,
        iteration_number,
        planning_date,
        release_date,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
