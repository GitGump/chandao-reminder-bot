import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { data, error } = await supabaseAdmin
      .from("system_config")
      .select("id, config_key, config_value, description, updated_at")
      .order("config_key", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Convert to key-value pairs
    const config: Record<string, string> = {};
    if (data) {
      for (const row of data) {
        config[row.config_key] = row.config_value;
      }
    }

    return NextResponse.json({
      config,
      items: data || [],
    });
  } catch (err) {
    console.error("System config GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const body = await request.json();
    const { config_key, config_value, description } = body as {
      config_key: string;
      config_value: string;
      description?: string;
    };

    if (!config_key || config_value === undefined) {
      return NextResponse.json(
        { error: "config_key and config_value are required" },
        { status: 400 }
      );
    }

    // Upsert: update if exists, insert if not
    const { data, error } = await supabaseAdmin
      .from("system_config")
      .upsert(
        {
          config_key,
          config_value,
          description: description || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "config_key" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("System config POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
