import Link from "next/link";
import { signInAction } from "@/lib/auth/actions";
import { CAMPUS, isDemoMode } from "@/config/campus";
import { BrandLockup } from "@/components/brand/BrandMark";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasSupabasePublicConfig } from "@/lib/supabase/env";
import { DEFAULT_EMAIL_DOMAIN, displayEmailDomain } from "@/lib/registration/format";
import { cn } from "@/lib/utils";

function errorMessage(code?: string, staff?: boolean) {
  switch (code) {
    case "missing":
      return staff ? "Enter your email and password." : "Enter your username and password.";
    case "inactive":
      return "This account is inactive. Please contact administration.";
    case "session":
      return "Unable to start a session. Please try again.";
    default:
      return code ?? null;
  }
}

function loginHref(staff: boolean, next?: string) {
  const params = new URLSearchParams();
  if (staff) params.set("role", "staff");
  if (next) params.set("next", next);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; role?: string }>;
}) {
  const params = await searchParams;
  const staff = params.role === "staff";
  const error = errorMessage(params.error, staff);
  const configured = hasSupabasePublicConfig();
  const demo = isDemoMode();

  return (
    <div className="flex min-h-full items-center justify-center bg-[oklch(0.975_0.006_90)] px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8">
          <BrandLockup size="lg" align="center" priority />
        </div>

        <div className="rounded-2xl border border-border/80 bg-white p-6 shadow-[0_8px_30px_rgba(16,24,40,0.04)]">
          {!configured ? (
            <p className="text-sm text-muted-foreground">
              Supabase is not configured. Add project keys to <code>.env.local</code> to continue.
            </p>
          ) : (
            <form action={signInAction} className="space-y-4">
              <input type="hidden" name="next" value={params.next ?? ""} />
              <input type="hidden" name="account_kind" value={staff ? "staff" : "student"} />
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                <Link
                  href={loginHref(false, params.next)}
                  className={cn(
                    buttonVariants({ variant: staff ? "ghost" : "default", size: "sm" }),
                    "h-8 justify-center",
                  )}
                >
                  Student
                </Link>
                <Link
                  href={loginHref(true, params.next)}
                  className={cn(
                    buttonVariants({ variant: staff ? "default" : "ghost", size: "sm" }),
                    "h-8 justify-center",
                  )}
                >
                  Staff
                </Link>
              </div>
              {staff ? (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="h-11"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="email_local">IIM Calcutta email</Label>
                  <div className="flex items-center rounded-lg border border-input bg-white focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                    <Input
                      id="email_local"
                      name="email_local"
                      type="text"
                      inputMode="email"
                      autoComplete="username"
                      required
                      placeholder="username"
                      className="h-11 min-w-0 border-0 shadow-none focus-visible:ring-0"
                      aria-describedby="email-domain"
                    />
                    <span id="email-domain" className="shrink-0 px-3 text-sm font-medium text-muted-foreground">
                      {displayEmailDomain(DEFAULT_EMAIL_DOMAIN)}
                    </span>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-11"
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="h-11 w-full" size="lg">
                Sign in
              </Button>
            </form>
          )}
        </div>

        {demo && configured ? (
          <div className="mt-6 rounded-xl border border-border/70 bg-white/70 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Demo accounts</p>
            <p className="mt-2">Use Staff sign-in for these emails:</p>
            <p className="mt-2">admin@campus.local</p>
            <p>security1@example.com</p>
            <p>0308@campus.local</p>
            <p className="mt-2">Password: CampusAccess!2026</p>
          </div>
        ) : (
          <p className="mt-6 text-center text-xs text-muted-foreground">{CAMPUS.tagline}</p>
        )}
      </div>
    </div>
  );
}
