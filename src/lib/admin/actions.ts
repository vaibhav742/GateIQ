"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { isTenDigitPhone } from "@/config/campus";
import { createAdminClient, hasServiceRoleConfig } from "@/lib/supabase/admin";
import { purgeStudentIdCards } from "@/lib/admin/purge-id-cards";
import { isSecurityShift, securityAccountName } from "@/lib/admin/security-shift";

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
  "Creating a staff or student login needs SUPABASE_SERVICE_ROLE_KEY in .env.local. Paste the service_role secret from Supabase → Project Settings → API, then restart the app.";

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

export async function setStudentAccountStatusAction(studentId: string, status: "active" | "inactive") {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", studentId)
    .eq("role", "student");

  if (error) {
    return { error: "Unable to update this student's account." };
  }

  revalidatePath("/admin/students");
  revalidatePath("/admin/registration");
  return { success: true };
}

export async function setStudentAccountsStatusAction(studentIds: string[], status: "active" | "inactive") {
  const { supabase } = await requireRole("admin");
  const ids = [...new Set(studentIds.filter(Boolean))];
  if (!ids.length) {
    return { error: "Select at least one student." };
  }
  if (ids.length > 500) {
    return { error: "Too many students for one update. Narrow the filters and try again." };
  }

  const { error, count } = await supabase
    .from("profiles")
    .update({ status }, { count: "exact" })
    .in("id", ids)
    .eq("role", "student")
    .neq("status", status);

  if (error) {
    return { error: "Unable to update the selected student accounts." };
  }

  revalidatePath("/admin/students");
  revalidatePath("/admin/registration");
  return { success: true, updated: count ?? ids.length };
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

  await purgeStudentIdCards([studentId]);

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

  const shiftValue = required(formData, "shift");
  if (!isSecurityShift(shiftValue)) {
    return { error: "Choose morning or night shift." };
  }
  const email = required(formData, "email");
  const password = required(formData, "password");
  const gateId = required(formData, "gate_id");
  const guardNames = formData
    .getAll("guard_name")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!email || !password) {
    return { error: "Enter the shared staff email and password." };
  }
  if (password.length < 8) {
    return { error: "Use a password with at least 8 characters." };
  }
  if (!gateId) {
    return { error: "Assign this shift to a gate." };
  }
  if (!guardNames.length) {
    return { error: "Add at least one guard name." };
  }

  const fullName = securityAccountName(shiftValue);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "security" },
    user_metadata: { full_name: fullName, security_shift: shiftValue },
  });

  if (error || !data.user) {
    return { error: "Unable to create this shift login. The email may already be in use." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      role: "security",
      status: "active",
      security_shift: shiftValue,
    })
    .eq("id", data.user.id);

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "Shift login was created but profile details could not be saved." };
  }

  await admin
    .from("security_gate_assignments")
    .update({ active: false })
    .eq("security_user_id", data.user.id)
    .eq("active", true);

  const { error: assignmentError } = await admin.from("security_gate_assignments").insert({
    security_user_id: data.user.id,
    gate_id: gateId,
    active: true,
  });

  if (assignmentError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "Unable to assign this shift to the selected gate." };
  }

  const { error: guardsError } = await admin.from("security_shift_guards").insert(
    guardNames.map((name) => ({
      security_user_id: data.user.id,
      full_name: name,
    })),
  );

  if (guardsError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "Unable to save the guard names for this shift." };
  }

  revalidatePath("/admin/security");
  return { success: true };
}

export async function updateSecurityAction(formData: FormData) {
  await requireRole("admin");
  if (!hasServiceRoleConfig()) {
    return { error: SERVICE_ROLE_MISSING };
  }
  const admin = createAdminClient();

  const id = required(formData, "id");
  const shiftValue = required(formData, "shift");
  const gateId = required(formData, "gate_id");
  const status = required(formData, "status") === "inactive" ? "inactive" : "active";
  const password = required(formData, "password");

  if (!isSecurityShift(shiftValue)) {
    return { error: "Choose morning or night shift." };
  }
  if (password && password.length < 8) {
    return { error: "Use a password with at least 8 characters." };
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("full_name, security_shift")
    .eq("id", id)
    .eq("role", "security")
    .maybeSingle();

  if (!existing) {
    return { error: "Security account not found." };
  }

  const { count: guardCount } = await admin
    .from("security_shift_guards")
    .select("id", { count: "exact", head: true })
    .eq("security_user_id", id);

  if (!guardCount && !existing.security_shift && existing.full_name.trim()) {
    await admin.from("security_shift_guards").insert({
      security_user_id: id,
      full_name: existing.full_name.trim(),
    });
  }

  const fullName = securityAccountName(shiftValue);
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      status,
      security_shift: shiftValue,
    })
    .eq("id", id)
    .eq("role", "security");

  if (profileError) {
    return { error: "Unable to update this shift login." };
  }

  if (password) {
    const { error: passwordError } = await admin.auth.admin.updateUserById(id, { password });
    if (passwordError) {
      return { error: "Shift details were saved but the password could not be changed." };
    }
  }

  await admin
    .from("security_gate_assignments")
    .update({ active: false })
    .eq("security_user_id", id)
    .eq("active", true);

  if (gateId && status === "active") {
    const { error: assignmentError } = await admin.from("security_gate_assignments").insert({
      security_user_id: id,
      gate_id: gateId,
      active: true,
    });
    if (assignmentError) {
      return { error: "Shift login was updated but the gate assignment could not be saved." };
    }
  }

  revalidatePath("/admin/security");
  return { success: true };
}

export async function deleteSecurityAction(securityUserId: string) {
  await requireRole("admin");
  if (!hasServiceRoleConfig()) {
    return { error: SERVICE_ROLE_MISSING };
  }
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", securityUserId)
    .eq("role", "security")
    .maybeSingle();

  if (!profile) {
    return { error: "Security account not found." };
  }

  const { error } = await admin.auth.admin.deleteUser(securityUserId);
  if (error) {
    return { error: "Unable to delete this shift login." };
  }

  revalidatePath("/admin/security");
  return { success: true };
}

export async function addSecurityGuardAction(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const securityUserId = required(formData, "security_user_id");
  const fullName = required(formData, "full_name");

  if (!fullName) {
    return { error: "Enter the guard's name." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", securityUserId)
    .eq("role", "security")
    .maybeSingle();

  if (!profile) {
    return { error: "Security account not found." };
  }

  const { error } = await supabase.from("security_shift_guards").insert({
    security_user_id: securityUserId,
    full_name: fullName,
  });

  if (error) {
    return { error: "Unable to add this guard." };
  }

  revalidatePath("/admin/security");
  return { success: true };
}

export async function deleteSecurityGuardAction(guardId: string) {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase.from("security_shift_guards").delete().eq("id", guardId);

  if (error) {
    return { error: "Unable to remove this guard." };
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

export async function deleteGateAction(gateId: string) {
  const { supabase } = await requireRole("admin");

  const { data: gate } = await supabase.from("gates").select("id, name").eq("id", gateId).maybeSingle();
  if (!gate) {
    return { error: "Gate not found." };
  }

  const { count } = await supabase
    .from("entry_exit_logs")
    .select("id", { count: "exact", head: true })
    .eq("gate_id", gateId);

  if (count && count > 0) {
    return { error: "This gate has scan history. Deactivate it instead of deleting." };
  }

  const { error: assignmentError } = await supabase
    .from("security_gate_assignments")
    .delete()
    .eq("gate_id", gateId);

  if (assignmentError) {
    return { error: "Unable to unassign security from this gate." };
  }

  const { error } = await supabase.from("gates").delete().eq("id", gateId);
  if (error) {
    return { error: "Unable to delete this gate." };
  }

  revalidatePath("/admin/gates");
  revalidatePath("/admin/security");
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

export async function createStudentNoticeAction(formData: FormData) {
  const { supabase, profile } = await requireRole("admin");
  const body = required(formData, "body");
  const audience = required(formData, "audience") === "all" ? "all" : "missing_id";
  const days = Number(required(formData, "duration_days"));

  if (body.length < 1 || body.length > 500) {
    return { error: "Enter a notice between 1 and 500 characters." };
  }
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    return { error: "Choose how many days this notice should stay visible, from 1 to 60." };
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
  const { error } = await supabase.from("student_notices").insert({
    body,
    audience,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    created_by: profile.id,
  });

  if (error) {
    return { error: "Unable to push this notice." };
  }

  revalidatePath("/admin/students");
  revalidatePath("/student");
  return { success: true };
}

export async function endStudentNoticeAction(noticeId: string) {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase
    .from("student_notices")
    .update({ ends_at: new Date().toISOString() })
    .eq("id", noticeId);

  if (error) {
    return { error: "Unable to end this notice." };
  }

  revalidatePath("/admin/students");
  revalidatePath("/student");
  return { success: true };
}

export async function deleteStudentNoticeAction(noticeId: string) {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase.from("student_notices").delete().eq("id", noticeId);

  if (error) {
    return { error: "Unable to delete this notice." };
  }

  revalidatePath("/admin/students");
  revalidatePath("/student");
  return { success: true };
}
