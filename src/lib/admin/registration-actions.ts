"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { DEFAULT_EMAIL_DOMAIN, slugFromBatch } from "@/lib/registration/format";
import { purgeStudentIdCards } from "@/lib/admin/purge-id-cards";

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
    email_domain: DEFAULT_EMAIL_DOMAIN,
    status: "inactive",
    auto_approve: true,
    id_card_required: false,
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
  const autoApprove = required(formData, "auto_approve") !== "false";

  if (!name) {
    return { error: "Form name is required." };
  }
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
    return { error: "Use a short public URL slug, such as pgp63." };
  }

  const { error } = await supabase
    .from("registration_forms")
    .update({
      name,
      slug,
      email_domain: DEFAULT_EMAIL_DOMAIN,
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

export async function setRegistrationIdCardRequiredAction(formId: string, required: boolean) {
  const { supabase } = await requireRole("admin");
  const { data, error } = await supabase
    .from("registration_forms")
    .update({ id_card_required: required })
    .eq("id", formId)
    .select("slug")
    .single();
  if (error) {
    return { error: "Unable to update ID card requirement." };
  }
  revalidatePath("/admin/registration");
  if (data?.slug) {
    revalidatePath("/register/" + data.slug);
  }
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
  const { data: batch } = await supabase.from("batches").select("id, batch_number").eq("id", batchId).maybeSingle();
  const { data: students } = batch
    ? await supabase
        .from("profiles")
        .select("id")
        .eq("role", "student")
        .or(`batch_id.eq.${batch.id},batch.eq.${batch.batch_number}`)
    : { data: [] as { id: string }[] };

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
  await purgeStudentIdCards((students ?? []).map((student) => student.id));
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

function normalizeHostelName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function revalidateHostelSurfaces() {
  revalidatePath("/admin/registration");
  revalidatePath("/admin/students");
  revalidatePath("/register", "layout");
}

export async function createHostelAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const name = normalizeHostelName(required(formData, "name"));
  if (!name || name.length > 40) {
    return { error: "Enter a hostel name (up to 40 characters)." };
  }

  const { error } = await supabase.from("hostels").insert({ name, status: "active" });
  if (error) {
    return { error: "Unable to add this hostel. The name may already exist." };
  }

  revalidateHostelSurfaces();
  return { success: true };
}

export async function updateHostelAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const id = required(formData, "id");
  const name = normalizeHostelName(required(formData, "name"));
  const status = required(formData, "status") === "inactive" ? "inactive" : "active";

  if (!id || !name || name.length > 40) {
    return { error: "Enter a hostel name (up to 40 characters)." };
  }

  const { data: current, error: currentError } = await supabase
    .from("hostels")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (currentError || !current) {
    return { error: "Unable to update this hostel." };
  }

  const { error } = await supabase.from("hostels").update({ name, status }).eq("id", id);
  if (error) {
    return { error: "Unable to update this hostel. The name may already exist." };
  }

  if (current.name !== name) {
    await supabase.from("profiles").update({ hostel: name }).eq("hostel", current.name);
  }

  revalidateHostelSurfaces();
  return { success: true };
}

export async function deleteHostelAction(hostelId: string) {
  const { supabase } = await requireRole("admin");
  const { data: hostel, error: hostelError } = await supabase
    .from("hostels")
    .select("id, name")
    .eq("id", hostelId)
    .maybeSingle();

  if (hostelError || !hostel) {
    return { error: "Unable to delete this hostel." };
  }

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("hostel", hostel.name);

  if (count && count > 0) {
    return { error: "This hostel is assigned to students. Deactivate it instead of deleting." };
  }

  const { error } = await supabase.from("hostels").delete().eq("id", hostelId);
  if (error) {
    return { error: "Unable to delete this hostel." };
  }

  revalidateHostelSurfaces();
  return { success: true };
}
