import { NextResponse } from "next/server";

export function apiError(error: unknown, message: string) {
  const requestId = crypto.randomUUID();
  console.error(`[api:${requestId}] ${message}`, error);
  return NextResponse.json({ error: message, requestId }, { status: 500 });
}
