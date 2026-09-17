"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { normalizeEmailDomain, slugFromBatch } from "@/lib/registration/format";

function required(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createBatchAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const batchNumber = required(formData, "batch_number");
  if (!/^[0-9]{2,4}$/.test(batchNumber)) {
    return { error: "Enter a valid batch number." };
  }

  const name = required(formData, "name") || `PGP ${batchNumber}`;
  const { data: batch, error } = await supabase
    .from("batches")
    .insert({ batch_number: batchNumber, name, status: "active" })
    .select("id")
    .single();

  if (error || !batch) {
    return { error: "Unable to create batch. It may already exist." };
  }

  const { error: formError } = await supabase.from("registration_forms").insert({
    batch_id: batch.id,
    name: `IIM Calcutta PGP ${batchNumber} Registration`,
    slug: slugFromBatch(batchNumber),
    email_domain: "iimcal.ac.in",
    status: "inactive",
    auto_approve: true,
  });

  if (formError) {
    return { error: "Batch was created but the registration form could not be saved." };
  }

  revalidatePath("/admin/registration");
  return { success: true, batchId: batch.id };
}

export async function saveRegistrationFormAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const id = required(formData, "id");
  const name = required(formData, "name");
  const slug = required(formData, "slug").toLowerCase();
  const emailDomain = normalizeEmailDomain(required(formData, "email_domain"));
  const autoApprove = required(formData, "auto_approve") !== "false";

  if (!name || !emailDomain) {
    return { error: "Form name and email domain are required." };
  }
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
    return { error: "Use a short public URL slug, such as pgp63." };
  }

  const { error } = await supabase
    .from("registration_forms")
    .update({
      name,
      slug,
      email_domain: emailDomain,
      auto_approve: autoApprove,
    })
    .eq("id", id);

  if (error) {
    return { error: "Unable to save the registration form. The URL may already be in use." };
  }

  revalidatePath("/admin/registration");
  revalidatePath("/register/" + slug);
  return { success: true };
}

export async function setRegistrationFormStatusAction(formId: string, status: "active" | "inactive") {
  const { supabase } = await requireRole("admin");
  const { data, error } = await supabase
    .from("registration_forms")
    .update({ status })
    .eq("id", formId)
    .select("slug")
    .single();
  if (error) {
    return { error: "Unable to update registration status." };
  }
  revalidatePath("/admin/registration");
  if (data?.slug) {
    revalidatePath("/register/" + data.slug);
  }
  return { success: true };
}

export async function archiveBatchAction(batchId: string) {
  const { supabase } = await requireRole("admin");
  const { data, error } = await supabase.rpc("archive_batch", { p_batch_id: batchId });
  if (error) {
    return { error: "Unable to archive this batch." };
  }
  const payload = data as { success?: boolean; message?: string };
  if (!payload?.success) {
    return { error: payload?.message ?? "Unable to archive this batch." };
  }
  revalidatePath("/admin/registration");
  revalidatePath("/admin/students");
  return { success: true };
}

export async function deleteBatchPermanentlyAction(batchId: string, confirmation: string) {
  const { supabase } = await requireRole("admin");
  const { data, error } = await supabase.rpc("delete_batch_permanently", {
    p_batch_id: batchId,
    p_confirmation: confirmation,
  });
  if (error) {
    return { error: "Unable to delete this batch." };
  }
  const payload = data as { success?: boolean; message?: string };
  if (!payload?.success) {
    return { error: payload?.message ?? "Unable to delete this batch." };
  }
  revalidatePath("/admin/registration");
  revalidatePath("/admin/students");
  revalidatePath("/admin/logs");
  revalidatePath("/admin");
  return { success: true };
}

export async function setRegistrationDecisionAction(input: {
  studentId: string;
  decision: "approved" | "rejected";
  reason?: string;
}) {
  const { supabase } = await requireRole("admin");
  const status = input.decision === "approved" ? "active" : "inactive";
  const registrationStatus = input.decision === "approved" ? "active" : "rejected";

  const { error } = await supabase
    .from("profiles")
    .update({
      status,
      registration_status: registrationStatus,
      rejection_reason: input.decision === "rejected" ? input.reason?.trim() || "Rejected by administration." : null,
    })
    .eq("id", input.studentId)
    .eq("role", "student");

  if (error) {
    return { error: "Unable to update this registration." };
  }

  revalidatePath("/admin/registration");
  revalidatePath("/admin/students");
  return { success: true };
}
