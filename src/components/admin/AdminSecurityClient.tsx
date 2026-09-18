"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addSecurityGuardAction,
  createSecurityAction,
  deleteSecurityAction,
  deleteSecurityGuardAction,
  updateSecurityAction,
} from "@/lib/admin/actions";
import {
  SECURITY_SHIFTS,
  securityShiftLabel,
  type SecurityShift,
} from "@/lib/admin/security-shift";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AccountStatusBadge } from "@/components/status/CampusStatusBadge";
import { nativeSelectClass } from "@/lib/utils";
import type { Gate, Profile, SecurityShiftGuard } from "@/types/database";

type SecurityRow = Profile & {
  gate_name: string | null;
  gate_id: string | null;
  guards: SecurityShiftGuard[];
};

const SHIFT_SECTIONS: { key: SecurityShift | "unassigned"; title: string }[] = [
  { key: "morning", title: "Morning shift" },
  { key: "night", title: "Night shift" },
  { key: "unassigned", title: "Needs a shift" },
];

export function AdminSecurityClient({
  people,
  gates,
}: {
  people: SecurityRow[];
  gates: Gate[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SecurityRow | null>(null);
  const [names, setNames] = useState(["", "", ""]);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string; success?: boolean }>, successMessage: string, close = false) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      if (close) {
        setOpen(false);
        setEditing(null);
      }
    });
  }

  function openCreate() {
    setEditing(null);
    setNames(["", "", ""]);
    setOpen(true);
  }

  function grouped(shift: SecurityShift | "unassigned") {
    return people.filter((person) =>
      shift === "unassigned" ? !person.security_shift : person.security_shift === shift,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={openCreate}>Add shift account</Button>
      </div>

      {SHIFT_SECTIONS.map((section) => {
        const rows = grouped(section.key);
        if (section.key === "unassigned" && rows.length === 0) return null;

        return (
          <section key={section.key} className="space-y-3">
            <div>
              <h2 className="font-heading text-lg font-semibold">{section.title}</h2>
              <p className="text-sm text-muted-foreground">
                Guards on this shift share one staff email and password at the assigned gate.
              </p>
            </div>
            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/80 bg-white px-4 py-6 text-sm text-muted-foreground">
                No {section.title.toLowerCase()} login yet.
              </p>
            ) : (
              <div className="grid gap-3">
                {rows.map((person) => (
                  <ShiftAccountCard
                    key={person.id}
                    person={person}
                    pending={pending}
                    onEdit={() => {
                      setEditing(person);
                      setOpen(true);
                    }}
                    onDelete={() => {
                      if (!confirm(`Delete the ${securityShiftLabel(person.security_shift).toLowerCase()} login for ${person.email}?`)) {
                        return;
                      }
                      run(() => deleteSecurityAction(person.id), "Shift login deleted.");
                    }}
                    onAddGuard={(formData) =>
                      run(() => addSecurityGuardAction(formData), "Guard added.")
                    }
                    onDeleteGuard={(guard) => {
                      if (!confirm(`Remove ${guard.full_name} from this shift?`)) return;
                      run(() => deleteSecurityGuardAction(guard.id), "Guard removed.");
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit shift login" : "Add shift account"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Set a new password without the previous one. Guard names are managed on the shift card."
                : "Create one shared login for the guards on this shift."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            action={(formData) =>
              run(
                () => (editing ? updateSecurityAction(formData) : createSecurityAction(formData)),
                editing ? "Shift login updated." : "Shift account created.",
                true,
              )
            }
          >
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="space-y-1.5">
              <Label htmlFor="shift">Shift</Label>
              <select
                id="shift"
                name="shift"
                required
                defaultValue={editing?.security_shift ?? "morning"}
                className={nativeSelectClass}
              >
                {SECURITY_SHIFTS.map((shift) => (
                  <option key={shift} value={shift}>
                    {securityShiftLabel(shift)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gate_id">Gate</Label>
              <select
                id="gate_id"
                name="gate_id"
                required
                defaultValue={editing?.gate_id ?? ""}
                className={nativeSelectClass}
              >
                <option value="" disabled>
                  Select a gate
                </option>
                {gates.map((gate) => (
                  <option key={gate.id} value={gate.id}>
                    {gate.name}
                  </option>
                ))}
              </select>
            </div>
            {!editing ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Staff email</Label>
                  <Input id="email" name="email" type="email" required autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label>Guard names</Label>
                  {names.map((name, index) => (
                    <Input
                      key={index}
                      name="guard_name"
                      value={name}
                      required={index === 0}
                      placeholder={`Guard ${index + 1}`}
                      onChange={(event) => {
                        const next = [...names];
                        next[index] = event.target.value;
                        setNames(next);
                      }}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setNames((current) => [...current, ""])}
                  >
                    Add another name
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Staff email</Label>
                  <p className="text-sm">{editing.email}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Leave blank to keep the current password"
                  />
                </div>
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
              </>
            )}
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

function ShiftAccountCard({
  person,
  pending,
  onEdit,
  onDelete,
  onAddGuard,
  onDeleteGuard,
}: {
  person: SecurityRow;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddGuard: (formData: FormData) => void;
  onDeleteGuard: (guard: SecurityShiftGuard) => void;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{person.gate_name ?? "No gate assigned"}</p>
          <p className="truncate text-sm text-muted-foreground">{person.email}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AccountStatusBadge status={person.status} />
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">Guards</p>
        <div className="mt-2 grid gap-2">
          {person.guards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guards listed yet.</p>
          ) : (
            person.guards.map((guard) => (
              <div
                key={guard.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2"
              >
                <p className="text-sm font-medium">{guard.full_name}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => onDeleteGuard(guard)}
                >
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>
        <form className="mt-3 flex gap-2" action={onAddGuard}>
          <input type="hidden" name="security_user_id" value={person.id} />
          <Input name="full_name" placeholder="Add guard name" required className="h-10" />
          <Button type="submit" variant="outline" size="sm" className="h-10" disabled={pending}>
            Add
          </Button>
        </form>
      </div>
    </div>
  );
}
