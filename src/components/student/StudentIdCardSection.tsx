"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IdCardCapture } from "@/components/registration/IdCardCapture";
import { StudentIdCardImage } from "@/components/security/StudentIdCardImage";
import { uploadOwnIdCardAction } from "@/lib/student/actions";
import { hasIdCard } from "@/lib/registration/id-card";

export function StudentIdCardSection({ path }: { path: string | null }) {
  const router = useRouter();
  const [idCard, setIdCard] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (hasIdCard(path)) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Campus ID card</p>
        <div className="max-w-sm">
          <StudentIdCardImage path={path} alt="Your ID card" />
        </div>
        <p className="text-xs text-muted-foreground">Your ID is on file for gate checks. Contact administration to change it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <p className="text-sm font-medium text-amber-950">Add your campus ID</p>
      <p className="text-sm text-amber-900/80">
        Photograph your ID as soon as you receive it. Administration can disable accounts that do not upload one.
      </p>
      <IdCardCapture
        value={idCard}
        disabled={pending}
        onChange={(file) => {
          setIdCard(file);
          setError(null);
          if (!file) return;
          const formData = new FormData();
          formData.set("id_card", file);
          startTransition(async () => {
            const result = await uploadOwnIdCardAction(formData);
            if (result.error) {
              setError(result.error);
              setIdCard(null);
              return;
            }
            router.refresh();
          });
        }}
      />
      {pending ? <p className="text-sm text-muted-foreground">Saving your ID photo...</p> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
