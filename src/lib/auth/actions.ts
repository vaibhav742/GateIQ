"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole, type UserRole } from "@/config/campus";

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

function safeNextPath(next: string, role: UserRole) {
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return null;
  }
  if (next === `/${role}` || next.startsWith(`/${role}/`)) {
    return next;
  }
  return null;
}

export async function signInAction(formData: FormData) {
  try {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const next = String(formData.get("next") ?? "");

    if (!email || !password) {
      redirect("/login?error=missing");
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      redirect(`/login?error=${encodeURIComponent(friendlyAuthError(error.message))}`);
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (userError || !userId) {
      redirect("/login?error=session");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", userId)
      .maybeSingle();

    if (!profile || profile.status !== "active") {
      await supabase.auth.signOut();
      redirect("/login?error=inactive");
    }

    const role = profile.role as UserRole;
    redirect(safeNextPath(next, role) ?? homeForRole(role));
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/login?error=${encodeURIComponent("Unable to sign in. Please try again.")}`);
  }
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
