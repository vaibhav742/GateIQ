"use client";

import { useState, useTransition } from "react";
import { createSecurityAction, updateSecurityAction } from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountStatusBadge } from "@/components/status/CampusStatusBadge";
import { nativeSelectClass } from "@/lib/utils";
import type { Gate, Profile } from "@/types/database";

type SecurityRow = Profile & { gate_name: string | null; gate_id: string | null };

export function AdminSecurityClient({
  people,
  gates,
}: {
  people: SecurityRow[];
  gates: Gate[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SecurityRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = editing ? await updateSecurityAction(formData) : await createSecurityAction(formData);
      if ("error" in result && result.error) {
        setMessage(result.error);
        return;
      }
      setOpen(false);
      setEditing(null);
    });
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
          Add security user
        </Button>
      </div>
      <div className="grid gap-3">
        {people.map((person) => (
          <div key={person.id} className="flex flex-col gap-3 rounded-xl border border-border/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{person.full_name}</p>
              <p className="truncate text-sm text-muted-foreground">{person.email}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Assigned gate: {person.gate_name ?? "None"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <AccountStatusBadge status={person.status} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(person);
                  setOpen(true);
                }}
              >
                Edit
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit security user" : "Add security user"}</DialogTitle>
          </DialogHeader>
          <form action={submit} className="grid gap-3">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Name</Label>
              <Input id="full_name" name="full_name" defaultValue={editing?.full_name} required />
            </div>
            {!editing ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" name="password" type="password" required />
                </div>
              </>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={editing?.phone ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gate_id">Gate</Label>
              <select
                id="gate_id"
                name="gate_id"
                defaultValue={editing?.gate_id ?? ""}
                className={nativeSelectClass}
              >
                <option value="">Unassigned</option>
                {gates.map((gate) => (
                  <option key={gate.id} value={gate.id}>
                    {gate.name}
                  </option>
                ))}
              </select>
            </div>
            {editing ? (
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <Input id="status" name="status" defaultValue={editing.status} />
              </div>
            ) : null}
            {message ? <p className="text-sm text-destructive">{message}</p> : null}
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
