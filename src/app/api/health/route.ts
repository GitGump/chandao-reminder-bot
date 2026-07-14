import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    // Test DB connection
    let dbStatus: "connected" | "error" = "connected";
    try {
      const { error } = await supabaseAdmin
        .from("system_config")
        .select("config_key")
        .limit(1);
      if (error) {
        dbStatus = "error";
      }
    } catch {
      dbStatus = "error";
    }

    // Get latest worker heartbeat
    let worker: { last_heartbeat: string; status: string } | null = null;
    try {
      const { data: heartbeats } = await supabaseAdmin
        .from("worker_heartbeat")
        .select("last_heartbeat, status")
        .order("last_heartbeat", { ascending: false })
        .limit(1);

      if (heartbeats && heartbeats.length > 0) {
        const hb = heartbeats[0] as Record<string, unknown>;
        const lastHb = hb.last_heartbeat as string;
        const heartbeatTime = new Date(lastHb);
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        worker = {
          last_heartbeat: lastHb,
          status: heartbeatTime >= tenMinAgo ? "running" : "stale",
        };
      }
    } catch {
      // Worker heartbeat query failed - non-critical
    }

    // Get latest successful push
    let lastPush: { pushed_at: string; message_type: number } | null = null;
    try {
      const { data: pushes } = await supabaseAdmin
        .from("push_logs")
        .select("pushed_at, message_type")
        .eq("status", "success")
        .order("pushed_at", { ascending: false })
        .limit(1);

      if (pushes && pushes.length > 0) {
        const p = pushes[0] as Record<string, unknown>;
        lastPush = {
          pushed_at: p.pushed_at as string,
          message_type: p.message_type as number,
        };
      }
    } catch {
      // Push logs query failed - non-critical
    }

    return NextResponse.json({
      status: "ok",
      db: dbStatus,
      worker,
      last_push: lastPush,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Health check error:", err);
    return NextResponse.json(
      {
        status: "error",
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
