"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createStudentAction, deleteStudentAction, updateStudentAction, regenerateQrAction } from "@/lib/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AccountStatusBadge } from "@/components/status/CampusStatusBadge";
import { nativeSelectClass } from "@/lib/utils";
import type { Hostel, Profile } from "@/types/database";

type StudentRow = Profile & { qr_status: string | null };

export function AdminStudentsClient({
  students,
  hostels,
}: {
  students: StudentRow[];
  hostels: Hostel[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState<StudentRow | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const batches = Array.from(new Set(students.map((student) => student.batch).filter(Boolean))) as string[];

  const rows = students.filter((student) => {
    const haystack = `${student.full_name} ${student.roll_number ?? ""} ${student.email ?? ""}`.toLowerCase();
    const searchOk = haystack.includes(query.trim().toLowerCase());
    const batchOk = batchFilter === "all" || student.batch === batchFilter;
    return searchOk && batchOk;
  });

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = editing
        ? await updateStudentAction(formData)
        : await createStudentAction(formData);
      if ("error" in result && result.error) {
        setMessage(result.error);
        return;
      }
      setOpen(false);
      setEditing(null);
      setMessage(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search students..."
            className="h-10 sm:max-w-xs"
          />
          <select
            value={batchFilter}
            onChange={(event) => setBatchFilter(event.target.value)}
            className={nativeSelectClass + " sm:w-40"}
            aria-label="Batch"
          >
            <option value="all">All batches</option>
            {batches.map((batch) => (
              <option key={batch} value={batch}>
                Batch {batch}
              </option>
            ))}
          </select>
        </div>
        <Button
          className="sm:w-auto"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add student
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/80 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Roll Number</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Hostel</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">QR Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((student) => (
                <tr key={student.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{student.roll_number ?? "—"}</td>
                  <td className="px-4 py-3">{student.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{student.email}</td>
                  <td className="px-4 py-3">{student.batch ?? "—"}</td>
                  <td className="px-4 py-3">{student.hostel ?? "—"}</td>
                  <td className="px-4 py-3">{student.room_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    <AccountStatusBadge status={student.status} />
                  </td>
                  <td className="px-4 py-3">
                    <AccountStatusBadge status={student.qr_status ?? "revoked"} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(student);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Regenerate this student's QR?")) {
                            startTransition(async () => {
                              await regenerateQrAction(student.id);
                            });
                          }
                        }}
                      >
                        QR
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setDeleting(student);
                          setConfirmation("");
                          setDeleteError(null);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit student" : "Add student"}</DialogTitle>
          </DialogHeader>
          <form action={submit} className="grid gap-3">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <Field name="full_name" label="Full name" defaultValue={editing?.full_name} required />
            {!editing ? <Field name="email" label="Email" type="email" required /> : null}
            {!editing ? <Field name="password" label="Initial password" type="password" required /> : null}
            <Field name="roll_number" label="Roll number" defaultValue={editing?.roll_number ?? ""} required />
            <Field name="batch" label="Batch" defaultValue={editing?.batch ?? ""} />
            <div className="space-y-1.5">
              <Label htmlFor="hostel">Hostel</Label>
              <select
                id="hostel"
                name="hostel"
                defaultValue={editing?.hostel ?? ""}
                className={nativeSelectClass}
              >
                <option value="">Select hostel</option>
                {hostels
                  .filter((hostel) => hostel.status === "active" || hostel.name === editing?.hostel)
                  .map((hostel) => (
                    <option key={hostel.id} value={hostel.name}>
                      {hostel.name}
                    </option>
                  ))}
              </select>
            </div>
            <Field name="room_number" label="Room number" defaultValue={editing?.room_number ?? ""} />
            <Field name="phone" label="Mobile number" defaultValue={editing?.phone ?? ""} />
            {editing ? (
              <Field name="status" label="Status (active/inactive)" defaultValue={editing.status} />
            ) : null}
            {message ? <p className="text-sm text-destructive">{message}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(next) => {
          if (!next) {
            setDeleting(null);
            setConfirmation("");
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete student</DialogTitle>
          </DialogHeader>
          {deleting ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This permanently removes {deleting.full_name}
                {deleting.roll_number ? ` (${deleting.roll_number})` : ""}, their QR credential, their login, and
                all of their entry/exit records. This cannot be undone.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="delete_confirmation">
                  Type <span className="font-semibold text-foreground">{deleting.roll_number || deleting.email}</span>{" "}
                  to confirm
                </Label>
                <Input
                  id="delete_confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="h-10"
                  autoComplete="off"
                />
              </div>
              {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDeleting(null);
                    setConfirmation("");
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending || confirmation !== (deleting.roll_number || deleting.email)}
                  onClick={() => {
                    const student = deleting;
                    startTransition(async () => {
                      const result = await deleteStudentAction(student.id, confirmation);
                      if ("error" in result && result.error) {
                        setDeleteError(result.error);
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Student deleted.");
                      setDeleting(null);
                      setConfirmation("");
                      setDeleteError(null);
                    });
                  }}
                >
                  {pending ? "Deleting..." : "Permanently delete"}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required={required} />
    </div>
  );
}
