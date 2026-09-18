"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole, type UserRole } from "@/config/campus";
import { resolveStudentEmail } from "@/lib/registration/format";

function friendlyAuthError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("invalid login") || value.includes("invalid credentials")) {
    return "Invalid email or password.";
  }
  if (value.includes("email not confirmed")) {
    return "This account has not been confirmed yet.";
  }
  return "Unable to sign in. Please try again.";
}

function studentAuthError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("invalid login") || value.includes("invalid credentials")) {
    return "Invalid username or password.";
  }
  return friendlyAuthError(message);
}

function safeNextPath(next: string, role: UserRole) {
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return null;
  }
  if (next === `/${role}` || next.startsWith(`/${role}/`)) {
    return next;
  }
  return null;
}

function loginPath(error: string, staff: boolean, next: string) {
  const params = new URLSearchParams({ error });
  if (staff) params.set("role", "staff");
  if (next) params.set("next", next);
  return `/login?${params.toString()}`;
}

export async function signInAction(formData: FormData) {
  const staff = String(formData.get("account_kind") ?? "") === "staff";
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  try {
    const email = staff
      ? String(formData.get("email") ?? "").trim().toLowerCase()
      : resolveStudentEmail(String(formData.get("email_local") ?? ""));

    if (!email || !password) {
      redirect(loginPath("missing", staff, next));
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      redirect(
        loginPath(
          staff ? friendlyAuthError(error.message) : studentAuthError(error.message),
          staff,
          next,
        ),
      );
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (userError || !userId) {
      redirect(loginPath("session", staff, next));
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", userId)
      .maybeSingle();

    if (!profile || profile.status !== "active") {
      await supabase.auth.signOut();
      redirect(loginPath("inactive", staff, next));
    }

    const role = profile.role as UserRole;
    redirect(safeNextPath(next, role) ?? homeForRole(role));
  } catch (error) {
    unstable_rethrow(error);
    redirect(loginPath("Unable to sign in. Please try again.", staff, next));
  }
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
