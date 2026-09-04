"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function createAthlete(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const jerseyNumber = String(formData.get("jersey_number") ?? "").trim();

  if (!name) {
    throw new Error("name is required.");
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("athletes").insert({
    id: crypto.randomUUID(),
    name,
    jersey_number: jerseyNumber || null,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/athletes");
  revalidatePath("/admin/clips");
}
