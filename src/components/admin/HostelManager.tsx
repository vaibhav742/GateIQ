"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountStatusBadge } from "@/components/status/CampusStatusBadge";
import { nativeSelectClass } from "@/lib/utils";
import {
  createHostelAction,
  deleteHostelAction,
  updateHostelAction,
} from "@/lib/admin/registration-actions";
import type { Hostel } from "@/types/database";

export function HostelManager({ hostels }: { hostels: Hostel[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Hostel | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string; success?: boolean }>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      setEditing(null);
    });
  }

  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">Hostels</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Students pick from this list on the registration form. Add a hostel when a new building opens.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add hostel
        </Button>
      </div>

      <div className="mt-4 grid gap-2">
        {hostels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hostels yet. Add the first one to start registration.</p>
        ) : (
          hostels.map((hostel) => (
            <div
              key={hostel.id}
              className="flex flex-col gap-2 rounded-lg border border-border/70 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-2">
                <p className="font-medium">{hostel.name}</p>
                <AccountStatusBadge status={hostel.status} />
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(hostel);
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (!confirm(`Delete ${hostel.name}?`)) return;
                    run(() => deleteHostelAction(hostel.id), "Hostel deleted.");
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit hostel" : "Add hostel"}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            action={(formData) =>
              run(
                () => (editing ? updateHostelAction(formData) : createHostelAction(formData)),
                editing ? "Hostel updated." : "Hostel added.",
              )
            }
          >
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="space-y-1.5">
              <Label htmlFor="hostel_name">Name</Label>
              <Input id="hostel_name" name="name" defaultValue={editing?.name ?? ""} required maxLength={40} />
            </div>
            {editing ? (
              <div className="space-y-1.5">
                <Label htmlFor="hostel_status">Status</Label>
                <select
                  id="hostel_status"
                  name="status"
                  defaultValue={editing.status}
                  className={nativeSelectClass}
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
