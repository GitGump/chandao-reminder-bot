import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (request.headers.get("x-api-key") !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("chanzhou_config")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (request.headers.get("x-api-key") !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { base_iteration, base_chanzhou_num, increment } = body;

  if (!base_iteration || base_chanzhou_num === undefined || increment === undefined) {
    return NextResponse.json(
      { error: "base_iteration, base_chanzhou_num, and increment are required" },
      { status: 400 }
    );
  }

  const upsertPayload = {
    id: 1,
    base_iteration,
    base_chanzhou_num,
    increment,
  };

  const { data, error } = await supabaseAdmin
    .from("chanzhou_config")
    .upsert(upsertPayload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
