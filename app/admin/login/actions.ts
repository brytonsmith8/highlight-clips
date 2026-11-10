"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { checkAdminPassword } from "@/lib/admin/auth";
import {
  FAILURE_DELAY_MS,
  checkLoginGate,
  clearLoginFailures,
  clientHash,
  clientIpFromHeaders,
  recordLoginFailure,
} from "@/lib/admin/login-limit";
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  createSessionToken,
} from "@/lib/admin/session";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  const h = await headers();
  const hash = clientHash(clientIpFromHeaders((n) => h.get(n)));

  // Locked out after repeated wrong passwords: the password is not even checked.
  if ((await checkLoginGate(hash)).locked) {
    redirect("/admin/login?error=locked");
  }

  if (!checkAdminPassword(password)) {
    await recordLoginFailure(hash);
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    redirect("/admin/login?error=1");
  }
  await clearLoginFailures(hash);

  const token = await createSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });

  redirect("/admin");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/admin/login");
}
