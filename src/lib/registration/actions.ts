"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { isTenDigitPhone } from "@/config/campus";
import { createAdminClient, hasServiceRoleConfig } from "@/lib/supabase/admin";
import { ID_CARD_BUCKET, idCardObjectPath, parseIdCardUpload } from "@/lib/registration/id-card";
import { normalizeEmailDomain, type PublicRegistrationForm } from "@/lib/registration/format";

type CheckResult = {
  success?: boolean;
  code?: string;
  message?: string;
  roll_number?: string;
};

export async function registerStudentAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const serial = String(formData.get("serial") ?? "").trim();
  const hostel = String(formData.get("hostel") ?? "").trim();
  const roomNumber = String(formData.get("room_number") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!firstName || !lastName || !email || !serial || !password) {
    return { error: "Please complete all required fields." };
  }
  if (!hostel) {
    return { error: "Please select a hostel." };
  }
  if (!roomNumber) {
    return { error: "Enter your room number." };
  }
  if (!isTenDigitPhone(phone)) {
    return { error: "Enter a 10-digit mobile number." };
  }
  if (password.length < 8) {
    return { error: "Use a password with at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const publicForm = await loadPublicRegistrationForm(slug);
  if (!publicForm) {
    return { error: "Registration is currently closed. Please contact the administration." };
  }
  if (!publicForm.hostels.includes(hostel)) {
    return { error: "Please select a hostel." };
  }

  const idCard = await parseIdCardUpload(formData.get("id_card"));
  if ("error" in idCard) {
    return { error: idCard.error };
  }
  if (publicForm.id_card_required && !idCard.file) {
    return { error: "Photograph the front of your ID card." };
  }

  const { data: checkData, error: checkError } = await supabase.rpc("check_student_registration", {
    p_slug: slug,
    p_email: email,
    p_serial: serial,
  });

  if (checkError) {
    return { error: "Unable to submit registration right now. Please try again." };
  }

  const check = checkData as CheckResult;
  if (!check?.success) {
    return { error: check?.message ?? "Unable to complete registration." };
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
        registration_slug: slug,
        registration_serial: serial,
        hostel,
        room_number: roomNumber,
        phone,
      },
    },
  });

  if (signUpError) {
    const message = signUpError.message.toLowerCase();
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return { error: "This email is already registered." };
    }
    if (message.includes("duplicate_roll")) {
      return { error: "This registration number is already registered." };
    }
    if (message.includes("invalid_email")) {
      return { error: "Please use your IIM Calcutta email address." };
    }
    if (message.includes("invalid_phone")) {
      return { error: "Enter a 10-digit mobile number." };
    }
    if (message.includes("invalid_hostel")) {
      return { error: "Please select a hostel." };
    }
    if (message.includes("invalid_room")) {
      return { error: "Enter your room number." };
    }
    if (message.includes("registration_closed")) {
      return { error: "Registration is currently closed. Please contact the administration." };
    }
    return { error: "Unable to complete registration. Please try again." };
  }

  const userId = signUpData.user?.id;
  if (!userId) {
    await supabase.auth.signOut();
    return { error: "Unable to complete registration. Please try again." };
  }

  if (idCard.file) {
    const uploaded = await storeStudentIdCard(supabase, userId, idCard.file);
    if (!uploaded) {
      if (hasServiceRoleConfig()) {
        await createAdminClient().auth.admin.deleteUser(userId);
      }
      await supabase.auth.signOut();
      return { error: "Could not save the ID photo. Please try registering again." };
    }
  }

  await supabase.auth.signOut();

  return {
    success: true,
    rollNumber: check.roll_number ?? serial,
    idUploaded: Boolean(idCard.file),
  };
}

export async function loadPublicRegistrationForm(slug: string): Promise<PublicRegistrationForm | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_registration_form", { p_slug: slug });
  if (error || !data) return null;
  const payload = data as { success?: boolean; form?: PublicRegistrationForm };
  if (!payload.success || !payload.form) return null;
  return {
    ...payload.form,
    email_domain: normalizeEmailDomain(payload.form.email_domain),
    hostels: parseHostelNames(payload.form.hostels),
    id_card_required: Boolean(payload.form.id_card_required),
  };
}

export async function loadAdminRegistrationPreview(slug: string): Promise<PublicRegistrationForm | null> {
  const { profile, supabase } = await getCurrentProfile();
  if (profile?.role !== "admin") return null;

  const { data: form } = await supabase
    .from("registration_forms")
    .select("name, slug, status, email_domain, batch_id, id_card_required")
    .eq("slug", slug.trim().toLowerCase())
    .maybeSingle();

  if (!form) return null;

  const { data: batch } = await supabase
    .from("batches")
    .select("batch_number, name")
    .eq("id", form.batch_id)
    .maybeSingle();

  if (!batch) return null;

  const { data: hostels } = await supabase
    .from("hostels")
    .select("name")
    .eq("status", "active")
    .order("name");

  return {
    name: form.name,
    slug: form.slug,
    status: form.status,
    email_domain: normalizeEmailDomain(form.email_domain),
    id_card_required: Boolean(form.id_card_required),
    batch_number: batch.batch_number,
    batch_name: batch.name,
    registration_suffix: `/${batch.batch_number}`,
    hostels: (hostels ?? []).map((row) => row.name),
  };
}

function parseHostelNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

async function storeStudentIdCard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: Blob,
) {
  const path = idCardObjectPath(userId);
  const storageClient = hasServiceRoleConfig() ? createAdminClient() : supabase;
  const { error: uploadError } = await storageClient.storage.from(ID_CARD_BUCKET).upload(path, file, {
    contentType: "image/jpeg",
    upsert: false,
    cacheControl: "3600",
  });
  if (uploadError) return false;

  const { error: profileError } = await storageClient
    .from("profiles")
    .update({ id_card_path: path })
    .eq("id", userId);
  return !profileError;
}
