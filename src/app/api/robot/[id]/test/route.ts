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

  const { data: robot, error } = await supabaseAdmin
    .from("robot_config")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !robot) {
    return NextResponse.json(
      { error: "Robot not found" },
      { status: 404 }
    );
  }

  try {
    const res = await fetch(robot.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "【测试消息】迭代需求群消息自动通知系统 - 机器人配置测试成功！",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ success: false, error: text });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
