"use client";

import { useTransition } from "react";
import { regenerateQrAction } from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";

export function RegenerateQrButton({ studentId }: { studentId?: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm("This will revoke the current QR and issue a new campus ID. Continue?")) {
          return;
        }
        startTransition(async () => {
          await regenerateQrAction(studentId);
        });
      }}
    >
      {pending ? "Regenerating..." : "Regenerate QR"}
    </Button>
  );
}
