import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole, type UserRole } from "@/config/campus";
import type { Profile } from "@/types/database";

export async function getVerifiedUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  return data.claims.sub as string;
}

export async function getCurrentProfile() {
  const supabase = await createClient();
  const userId = await getVerifiedUserId();

  if (!userId) {
    return { supabase, profile: null as Profile | null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  return { supabase, profile: profile ?? null };
}

export async function requireUser() {
  const session = await getCurrentProfile();

  if (!session.profile) {
    redirect("/login");
  }

  if (session.profile.status !== "active") {
    redirect("/login?error=inactive");
  }

  return { supabase: session.supabase, profile: session.profile };
}

export async function requireRole(role: UserRole | UserRole[]) {
  const session = await requireUser();
  const allowed = Array.isArray(role) ? role : [role];

  if (!allowed.includes(session.profile.role)) {
    redirect(homeForRole(session.profile.role));
  }

  return session;
}
