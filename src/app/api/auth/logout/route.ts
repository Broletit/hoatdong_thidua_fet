import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/server/auth/session";

export async function POST() {
  await revokeCurrentSession();
  return NextResponse.json({ ok: true, redirectTo: "/login" });
}

export async function GET(request: Request) {
  await revokeCurrentSession();
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}