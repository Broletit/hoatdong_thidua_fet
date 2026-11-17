"use server";

import { revokeCurrentSession } from "@/server/auth/session";

export async function logoutAction() {
  await revokeCurrentSession();
  return { ok: true, redirectTo: "/login" };
}