import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");

    let query = supabaseAdmin
      .from("holidays")
      .select("id, name, start_date, end_date, year, created_at")
      .order("start_date", { ascending: true });

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      if (!isNaN(year)) {
        query = query.eq("year", year);
      }
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("Holidays GET error:", err);
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
    const { name, start_date, end_date, year } = body as {
      name: string;
      start_date: string;
      end_date: string;
      year: number;
    };

    if (!name || !start_date || !end_date || !year) {
      return NextResponse.json(
        { error: "Missing required fields: name, start_date, end_date, year" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("holidays")
      .insert({ name, start_date, end_date, year })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Holidays POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { searchParams } = new URL(request.url);
    let id: number | null = null;

    // Try reading from searchParams first
    const idParam = searchParams.get("id");
    if (idParam) {
      id = parseInt(idParam, 10);
    } else {
      // Try reading from body
      try {
        const body = await request.json();
        if (body.id) {
          id = body.id;
        }
      } catch {
        // No body or invalid JSON
      }
    }

    if (!id || isNaN(id)) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("holidays")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Holidays DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
