import { signInAction } from "@/lib/auth/actions";
import { CAMPUS, isDemoMode } from "@/config/campus";
import { BrandLockup } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasSupabasePublicConfig } from "@/lib/supabase/env";

function errorMessage(code?: string) {
  switch (code) {
    case "missing":
      return "Enter your email and password.";
    case "inactive":
      return "This account is inactive. Please contact administration.";
    case "session":
      return "Unable to start a session. Please try again.";
    default:
      return code ?? null;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = errorMessage(params.error);
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
