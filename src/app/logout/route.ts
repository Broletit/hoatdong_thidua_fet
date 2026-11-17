import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/server/auth/session";

export async function GET(request: Request) {
  await revokeCurrentSession();
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}

export async function POST(request: Request) {
  await revokeCurrentSession();
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}
