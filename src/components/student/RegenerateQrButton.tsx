"use client";

import { useState, useTransition } from "react";
import { regenerateQrAction } from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";

export function RegenerateQrButton({
  studentId,
  mode = "regenerate",
}: {
  studentId?: string;
  mode?: "generate" | "regenerate";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const generate = mode === "generate";

  return (
    <div className="space-y-2">
      <Button
        variant={generate ? "default" : "outline"}
        size={generate ? "lg" : "default"}
        className={generate ? "h-12 w-full max-w-md text-base" : undefined}
        disabled={pending}
        onClick={() => {
          if (
            !generate &&
            !confirm("This will revoke the current QR and issue a new campus ID. Continue?")
          ) {
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await regenerateQrAction(studentId);
            if (result && "error" in result && result.error) {
              setError(result.error);
            }
          });
        }}
      >
        {pending
          ? generate
            ? "Generating..."
            : "Regenerating..."
          : generate
            ? "Generate today's QR"
            : "Regenerate QR"}
      </Button>
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
