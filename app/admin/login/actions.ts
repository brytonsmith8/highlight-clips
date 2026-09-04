"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { checkAdminPassword } from "@/lib/admin/auth";
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  createSessionToken,
} from "@/lib/admin/session";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!checkAdminPassword(password)) {
    redirect("/admin/login?error=1");
  }

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
