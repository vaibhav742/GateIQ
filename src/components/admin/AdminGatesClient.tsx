"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createGateAction, deleteGateAction, updateGateAction } from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountStatusBadge } from "@/components/status/CampusStatusBadge";
import { nativeSelectClass } from "@/lib/utils";
import type { Gate } from "@/types/database";

export function AdminGatesClient({ gates }: { gates: Gate[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Gate | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string; success?: boolean } | void>, successMessage?: string) {
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (successMessage) toast.success(successMessage);
      setOpen(false);
      setEditing(null);
    });
  }

  function submit(formData: FormData) {
    run(
      () => (editing ? updateGateAction(formData) : createGateAction(formData)),
      editing ? "Gate updated." : "Gate added.",
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add gate
        </Button>
      </div>
      <div className="grid gap-3">
        {gates.map((gate) => (
          <div key={gate.id} className="flex flex-col gap-3 rounded-xl border border-border/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{gate.name}</p>
              <p className="text-sm text-muted-foreground">{gate.location ?? "No location set"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <AccountStatusBadge status={gate.status} />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(gate);
                  setOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Delete ${gate.name}?`)) return;
                  run(() => deleteGateAction(gate.id), "Gate deleted.");
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit gate" : "Add gate"}</DialogTitle>
          </DialogHeader>
          <form action={submit} className="grid gap-3">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={editing?.name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input id="location" name="location" defaultValue={editing?.location ?? ""} />
            </div>
            {editing ? (
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={editing.status === "inactive" ? "inactive" : "active"}
                  className={nativeSelectClass}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
