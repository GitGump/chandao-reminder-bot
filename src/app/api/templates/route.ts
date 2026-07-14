import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (request.headers.get("x-api-key") !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("message_templates")
    .select("*")
    .order("message_type");

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
  const { message_type, template_content, is_active } = body;

  if (message_type === undefined || !template_content) {
    return NextResponse.json(
      { error: "message_type and template_content are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("message_templates")
    .upsert(
      { message_type, template_content, is_active: is_active ?? true },
      { onConflict: "message_type" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
