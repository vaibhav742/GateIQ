"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CAMPUS } from "@/config/campus";
import { registerStudentAction } from "@/lib/registration/actions";
import type { PublicRegistrationForm } from "@/lib/registration/format";
import { displayEmailDomain } from "@/lib/registration/format";

export function PublicRegistrationForm({
  form,
  preview,
}: {
  form: PublicRegistrationForm;
  preview?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ rollNumber: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (success) {
    return (
      <Shell>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Registration successful</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your student account has been created for registration number{" "}
          <span className="font-medium text-foreground">{success.rollNumber}</span>.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">You can now sign in using your IIM Calcutta email.</p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground"
        >
          Continue to login
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      {preview ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Preview mode — this is exactly what students will see.
        </p>
      ) : null}
      <p className="text-[11px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
        {CAMPUS.product}
      </p>
      <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">{CAMPUS.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Student registration</p>
      <p className="mt-1 text-sm font-medium">{form.batch_name}</p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const domain = form.email_domain.replace(/^@+/, "").toLowerCase();
          const localPart = String(formData.get("email_local") ?? "")
            .trim()
            .toLowerCase()
            .replace(/@.*$/, "");
          const email = localPart ? `${localPart}@${domain}` : "";
          formData.set("email", email);
          const serial = String(formData.get("serial") ?? "").trim();
          const password = String(formData.get("password") ?? "");
          const confirm = String(formData.get("confirm_password") ?? "");
          setError(null);

          if (!localPart || localPart.includes(" ")) {
            setError("Please use your IIM Calcutta email address.");
            return;
          }
          if (!/^[0-9]{3,8}$/.test(serial)) {
            setError("Enter a valid registration number.");
            return;
          }
          if (password.length < 8) {
            setError("Use a password with at least 8 characters.");
            return;
          }
          if (password !== confirm) {
            setError("Passwords do not match.");
            return;
          }

          startTransition(async () => {
            const result = await registerStudentAction(formData);
            if ("error" in result && result.error) {
              setError(result.error);
              return;
            }
            if ("success" in result && result.success) {
              setSuccess({ rollNumber: result.rollNumber ?? "" });
            }
          });
        }}
      >
        <input type="hidden" name="slug" value={form.slug} />
        <Field id="first_name" name="first_name" label="First name" autoComplete="given-name" />
        <Field id="last_name" name="last_name" label="Last name" autoComplete="family-name" />
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
              className="h-11 min-w-0 border-0 shadow-none focus-visible:ring-0"
              aria-describedby="email-domain"
            />
            <span id="email-domain" className="shrink-0 px-3 text-sm font-medium text-muted-foreground">
              {displayEmailDomain(form.email_domain)}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="serial">Registration number</Label>
          <div className="flex items-center rounded-lg border border-input bg-white focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <Input
              id="serial"
              name="serial"
              inputMode="numeric"
              pattern="[0-9]{3,8}"
              minLength={3}
              maxLength={8}
              required
              placeholder="0306"
              className="h-11 border-0 shadow-none focus-visible:ring-0"
              aria-describedby="serial-suffix"
              autoComplete="off"
            />
            <span id="serial-suffix" className="shrink-0 px-3 text-sm font-medium text-muted-foreground">
              {form.registration_suffix}
            </span>
          </div>
        </div>
        <Field id="password" name="password" label="Password" type="password" autoComplete="new-password" />
        <Field
          id="confirm_password"
          name="confirm_password"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
        />
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-11 w-full" size="lg" disabled={pending || preview}>
          {pending ? "Registering..." : "Register"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By registering you agree to the campus access terms and institutional policies.
        </p>
      </form>
    </Shell>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="h-11"
      />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[oklch(0.975_0.006_90)] px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex justify-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-xs font-semibold tracking-[0.14em] text-primary-foreground">
            CA
          </div>
        </div>
        <div className="rounded-2xl border border-border/80 bg-white p-6 shadow-[0_8px_30px_rgba(16,24,40,0.04)] sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export function RegistrationClosed() {
  return (
    <Shell>
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Registration is currently closed.</h1>
      <p className="mt-3 text-sm text-muted-foreground">Please contact the administration.</p>
    </Shell>
  );
}
