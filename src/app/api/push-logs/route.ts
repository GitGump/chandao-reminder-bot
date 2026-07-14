import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (request.headers.get("x-api-key") !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const messageType = searchParams.get("message_type");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabaseAdmin
    .from("push_logs")
    .select("*", { count: "exact" })
    .order("pushed_at", { ascending: false });

  if (messageType) {
    query = query.eq("message_type", parseInt(messageType, 10));
  }
  if (status) {
    query = query.eq("status", status);
  }
  if (from) {
    query = query.gte("pushed_at", from);
  }
  if (to) {
    // Include the full end date by appending time
    query = query.lte("pushed_at", `${to}T23:59:59`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [], total: count ?? 0 });
}
