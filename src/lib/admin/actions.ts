"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { isTenDigitPhone } from "@/config/campus";
import { createAdminClient, hasServiceRoleConfig } from "@/lib/supabase/admin";

function required(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function hostelExists(
  client: ReturnType<typeof createAdminClient>,
  name: string,
  activeOnly: boolean,
) {
  const query = client.from("hostels").select("id").eq("name", name);
  const { data } = await (activeOnly ? query.eq("status", "active") : query).maybeSingle();
  return Boolean(data);
}

const SERVICE_ROLE_MISSING =
  "Adding a new account requires SUPABASE_SERVICE_ROLE_KEY in .env.local. Existing students can still be edited, deactivated, or deleted.";

export async function createStudentAction(formData: FormData) {
  await requireRole("admin");
  if (!hasServiceRoleConfig()) {
    return { error: SERVICE_ROLE_MISSING };
  }
  const admin = createAdminClient();

  const fullName = required(formData, "full_name");
  const email = required(formData, "email");
  const password = required(formData, "password");
  const rollNumber = required(formData, "roll_number");
  const batch = required(formData, "batch");
  const hostel = required(formData, "hostel");
  const roomNumber = required(formData, "room_number");
  const phone = required(formData, "phone");

  if (hostel && !(await hostelExists(admin, hostel, true))) {
    return { error: "Please select a valid hostel." };
  }
  if (phone && !isTenDigitPhone(phone)) {
    return { error: "Enter a 10-digit mobile number." };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "student" },
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    return { error: "Unable to create student. The email may already be in use." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      roll_number: rollNumber,
      batch,
      hostel: hostel || null,
      room_number: roomNumber || null,
      phone: phone || null,
      role: "student",
      status: "active",
    })
    .eq("id", data.user.id);

  if (profileError) {
    return { error: "Student was created but profile details could not be saved." };
  }

  revalidatePath("/admin/students");
  return { success: true };
}

export async function updateStudentAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const id = required(formData, "id");
  const fullName = required(formData, "full_name");
  const [firstName, ...rest] = fullName.split(/\s+/);
  const lastName = rest.join(" ") || null;
  const statusValue = required(formData, "status");
  const status = statusValue === "inactive" || statusValue === "archived" ? statusValue : "active";

  const hostel = required(formData, "hostel");
  const phone = required(formData, "phone");
  if (hostel) {
    const { data: hostelRow } = await supabase
      .from("hostels")
      .select("id")
      .eq("name", hostel)
      .maybeSingle();
    if (!hostelRow) {
      return { error: "Please select a valid hostel." };
    }
  }
  if (phone && !isTenDigitPhone(phone)) {
    return { error: "Enter a 10-digit mobile number." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      first_name: firstName || null,
      last_name: lastName,
      roll_number: required(formData, "roll_number") || null,
      batch: required(formData, "batch") || null,
      hostel: hostel || null,
      room_number: required(formData, "room_number") || null,
      phone: phone || null,
      status,
    })
    .eq("id", id)
    .eq("role", "student");

  if (error) {
    return { error: "Unable to update student." };
  }

  revalidatePath("/admin/students");
  revalidatePath("/admin/registration");
  return { success: true };
}

export async function deleteStudentAction(studentId: string, confirmation: string) {
  const { supabase } = await requireRole("admin");
  const { data, error } = await supabase.rpc("delete_student", {
    p_student_id: studentId,
    p_confirmation: confirmation,
  });

  if (error) {
    return { error: "Unable to delete this student." };
  }

  const payload = data as { success?: boolean; message?: string };
  if (!payload?.success) {
    return { error: payload?.message ?? "Unable to delete this student." };
  }

  revalidatePath("/admin/students");
  revalidatePath("/admin/registration");
  revalidatePath("/admin/logs");
  revalidatePath("/admin");
  return { success: true };
}

export async function regenerateQrAction(studentId?: string) {
  const { supabase, profile } = await requireRole(["admin", "student"]);
  const { data, error } = await supabase.rpc("regenerate_student_qr", {
    p_student_id: profile.role === "admin" ? studentId : profile.id,
  });

  if (error) {
    return { error: "Unable to regenerate QR." };
  }

  const payload = data as { success?: boolean; message?: string };
  if (!payload?.success) {
    return { error: payload?.message ?? "Unable to regenerate QR." };
  }

  revalidatePath("/student/qr");
  revalidatePath("/admin/students");
  return { success: true };
}

export async function createSecurityAction(formData: FormData) {
  await requireRole("admin");
  if (!hasServiceRoleConfig()) {
    return { error: SERVICE_ROLE_MISSING };
  }
  const admin = createAdminClient();

  const fullName = required(formData, "full_name");
  const email = required(formData, "email");
  const password = required(formData, "password");
  const gateId = required(formData, "gate_id");

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "security" },
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    return { error: "Unable to create security user." };
  }

  await admin
    .from("profiles")
    .update({ full_name: fullName, role: "security", status: "active", phone: required(formData, "phone") || null })
    .eq("id", data.user.id);

  if (gateId) {
    await admin
      .from("security_gate_assignments")
      .update({ active: false })
      .eq("security_user_id", data.user.id)
      .eq("active", true);

    await admin.from("security_gate_assignments").insert({
      security_user_id: data.user.id,
      gate_id: gateId,
      active: true,
    });
  }

  revalidatePath("/admin/security");
  return { success: true };
}

export async function updateSecurityAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const id = required(formData, "id");
  const gateId = required(formData, "gate_id");
  const status = required(formData, "status") === "inactive" ? "inactive" : "active";

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: required(formData, "full_name"),
      phone: required(formData, "phone") || null,
      status,
    })
    .eq("id", id)
    .eq("role", "security");

  if (profileError) {
    return { error: "Unable to update this security user." };
  }

  await supabase
    .from("security_gate_assignments")
    .update({ active: false })
    .eq("security_user_id", id)
    .eq("active", true);

  if (gateId && status === "active") {
    const { error: assignmentError } = await supabase.from("security_gate_assignments").insert({
      security_user_id: id,
      gate_id: gateId,
      active: true,
    });
    if (assignmentError) {
      return { error: "Security user was updated but the gate assignment could not be saved." };
    }
  }

  revalidatePath("/admin/security");
  return { success: true };
}

export async function createGateAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase.from("gates").insert({
    name: required(formData, "name"),
    location: required(formData, "location") || null,
    status: "active",
  });

  if (error) {
    return { error: "Unable to create gate." };
  }

  revalidatePath("/admin/gates");
  return { success: true };
}

export async function updateGateAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase
    .from("gates")
    .update({
      name: required(formData, "name"),
      location: required(formData, "location") || null,
      status: required(formData, "status") === "inactive" ? "inactive" : "active",
    })
    .eq("id", required(formData, "id"));

  if (error) {
    return { error: "Unable to update gate." };
  }

  revalidatePath("/admin/gates");
  return { success: true };
}

export async function adminOverrideAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const { data, error } = await supabase.rpc("admin_correct_movement", {
    p_student_id: required(formData, "student_id"),
    p_gate_id: required(formData, "gate_id"),
    p_action: required(formData, "action"),
    p_remarks: required(formData, "remarks"),
  });

  if (error) {
    return;
  }

  const payload = data as { success?: boolean; message?: string };
  if (!payload?.success) {
    return;
  }

  revalidatePath("/admin/logs");
  revalidatePath("/admin");
  revalidatePath("/admin/reports");
}
