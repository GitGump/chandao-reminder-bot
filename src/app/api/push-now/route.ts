import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  if (request.headers.get("x-api-key") !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { message_type } = body;

  if (!message_type || ![1, 2, 3].includes(message_type)) {
    return NextResponse.json(
      { error: "Invalid message_type" },
      { status: 400 }
    );
  }

  // 服务端内部请求 trigger 端点
  const triggerUrl = new URL("/api/trigger", request.url);
  const triggerRes = await fetch(triggerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-trigger-key": process.env.TRIGGER_KEY || "",
    },
    body: JSON.stringify({ message_type, push_source: "manual" }),
  });

  const data = await triggerRes.json();
  return NextResponse.json(data, { status: triggerRes.status });
}
