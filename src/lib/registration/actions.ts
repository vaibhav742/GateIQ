"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
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
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!firstName || !lastName || !email || !serial || !password) {
    return { error: "Please complete all required fields." };
  }
  if (password.length < 8) {
    return { error: "Use a password with at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
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

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
        registration_slug: slug,
        registration_serial: serial,
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
    if (message.includes("registration_closed")) {
      return { error: "Registration is currently closed. Please contact the administration." };
    }
    return { error: "Unable to complete registration. Please try again." };
  }

  await supabase.auth.signOut();

  return {
    success: true,
    rollNumber: check.roll_number ?? serial,
  };
}

export async function loadPublicRegistrationForm(slug: string): Promise<PublicRegistrationForm | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_registration_form", { p_slug: slug });
  if (error || !data) return null;
  const payload = data as { success?: boolean; form?: PublicRegistrationForm };
  if (!payload.success || !payload.form) return null;
  return payload.form;
}

export async function loadAdminRegistrationPreview(slug: string): Promise<PublicRegistrationForm | null> {
  const { profile, supabase } = await getCurrentProfile();
  if (profile?.role !== "admin") return null;

  const { data: form } = await supabase
    .from("registration_forms")
    .select("name, slug, status, email_domain, batch_id")
    .eq("slug", slug.trim().toLowerCase())
    .maybeSingle();

  if (!form) return null;

  const { data: batch } = await supabase
    .from("batches")
    .select("batch_number, name")
    .eq("id", form.batch_id)
    .maybeSingle();

  if (!batch) return null;

  return {
    name: form.name,
    slug: form.slug,
    status: form.status,
    email_domain: normalizeEmailDomain(form.email_domain),
    batch_number: batch.batch_number,
    batch_name: batch.name,
    registration_suffix: `/${batch.batch_number}`,
  };
}
