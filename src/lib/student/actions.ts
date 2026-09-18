"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { ID_CARD_BUCKET, idCardObjectPath, parseIdCardUpload } from "@/lib/registration/id-card";

export async function uploadOwnIdCardAction(formData: FormData) {
  const { supabase, profile } = await requireRole("student");
  if (profile.id_card_path) {
    return { error: "Your ID card is already on file." };
  }

  const parsed = await parseIdCardUpload(formData.get("id_card"));
  if ("error" in parsed) {
    return { error: parsed.error };
  }
  if (!parsed.file) {
    return { error: "Photograph the front of your ID card using the camera." };
  }

  const path = idCardObjectPath(profile.id);
  const { error: uploadError } = await supabase.storage.from(ID_CARD_BUCKET).upload(path, parsed.file, {
    contentType: "image/jpeg",
    upsert: false,
    cacheControl: "3600",
  });
  if (uploadError) {
    return { error: "Could not save the ID photo. Please try again." };
  }

  const { error: profileError } = await supabase.from("profiles").update({ id_card_path: path }).eq("id", profile.id);
  if (profileError) {
    return { error: "The photo was saved but your profile could not be updated. Please contact administration." };
  }

  revalidatePath("/student");
  revalidatePath("/student/profile");
  return { success: true };
}
