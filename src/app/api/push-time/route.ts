import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (request.headers.get("x-api-key") !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("push_time_config")
    .select("*")
    .order("message_type");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 手动 join robot_config 的 name
  const enriched = await Promise.all(
    (data as Record<string, unknown>[]).map(async (row) => {
      if (row.robot_id) {
        const { data: robot } = await supabaseAdmin
          .from("robot_config")
          .select("name")
          .eq("id", row.robot_id)
          .single();
        return { ...row, robot_config: robot ? { name: (robot as Record<string, unknown>).name } : null };
      }
      return { ...row, robot_config: null };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (request.headers.get("x-api-key") !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { message_type, robot_id, hour, minute, is_active } = body;

  if (message_type == null) {
    return NextResponse.json({ error: "message_type is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("push_time_config")
    .upsert({ message_type, robot_id, hour, minute, is_active }, { onConflict: "message_type" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
