"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountStatusBadge } from "@/components/status/CampusStatusBadge";
import { EmptyState } from "@/components/layout/EmptyState";
import { cn, nativeSelectClass } from "@/lib/utils";
import { displayEmailDomain } from "@/lib/registration/format";
import { deleteStudentAction } from "@/lib/admin/actions";
import {
  archiveBatchAction,
  createBatchAction,
  deleteBatchPermanentlyAction,
  saveRegistrationFormAction,
  setRegistrationDecisionAction,
  setRegistrationFormStatusAction,
} from "@/lib/admin/registration-actions";
import type { Batch, Profile, RegistrationForm } from "@/types/database";
import { formatCampusDateTime } from "@/lib/utils/format";

type Tab = "setup" | "registrations";

export function RegistrationManager({
  batches,
  forms,
  students,
}: {
  batches: Batch[];
  forms: RegistrationForm[];
  students: Profile[];
}) {
  const [tab, setTab] = useState<Tab>("setup");
  const [batchId, setBatchId] = useState(batches[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [studentToDelete, setStudentToDelete] = useState<Profile | null>(null);
  const [studentConfirmation, setStudentConfirmation] = useState("");
  const [origin, setOrigin] = useState("");
  const router = useRouter();

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const batch = batches.find((item) => item.id === batchId) ?? batches[0] ?? null;
  const form = forms.find((item) => item.batch_id === batch?.id) ?? null;
  const batchStudents = useMemo(
    () => students.filter((student) => student.batch_id === batch?.id || student.batch === batch?.batch_number),
    [students, batch],
  );

  const counts = {
    registered: batchStudents.length,
    approved: batchStudents.filter((s) => s.registration_status === "active" || s.registration_status === "approved").length,
    pending: batchStudents.filter((s) => s.registration_status === "pending").length,
  };

  const visible = batchStudents.filter((student) => {
    const haystack = `${student.first_name ?? ""} ${student.last_name ?? ""} ${student.full_name} ${student.email ?? ""} ${student.roll_number ?? ""}`.toLowerCase();
    const searchOk = haystack.includes(query.trim().toLowerCase());
    const statusOk = statusFilter === "all" || student.registration_status === statusFilter;
    return searchOk && statusOk;
  });

  const publicPath = form ? `/register/${form.slug}` : "";

  function run(action: () => Promise<{ error?: string; success?: boolean }>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      setArchiveOpen(false);
      setDeleteOpen(false);
      setConfirmation("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {batches.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setBatchId(item.id)}
              className={`rounded-xl border px-4 py-3 text-left ${
                item.id === batch?.id ? "border-primary bg-white shadow-sm" : "border-border/80 bg-white/70"
              }`}
            >
              <p className="text-sm font-medium">{item.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {students.filter((s) => s.batch_id === item.id || s.batch === item.batch_number).length} students · {item.status}
              </p>
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          action={(formData) =>
            run(() => createBatchAction(formData), "Batch created.")
          }
        >
          <Input name="batch_number" placeholder="New batch" className="h-10 w-28" required />
          <Button type="submit" variant="outline" disabled={pending}>
            Add batch
          </Button>
        </form>
      </div>

      <div className="flex gap-2">
        <Button variant={tab === "setup" ? "default" : "outline"} type="button" onClick={() => setTab("setup")}>
          Form setup
        </Button>
        <Button variant={tab === "registrations" ? "default" : "outline"} type="button" onClick={() => setTab("registrations")}>
          Registrations
        </Button>
      </div>

      {!batch ? (
        <EmptyState title="No batches yet." description="Create a batch to configure student registration." />
      ) : tab === "setup" ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-border/80 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">Student registration</p>
                <p className="mt-1 text-lg font-semibold">{batch.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {form?.status === "active" ? "● ACTIVE" : "○ INACTIVE"}
                </p>
              </div>
              {form ? (
                <Button
                  type="button"
                  disabled={pending}
                  variant={form.status === "active" ? "outline" : "default"}
                  onClick={() =>
                    run(
                      () => setRegistrationFormStatusAction(form.id, form.status === "active" ? "inactive" : "active"),
                      form.status === "active" ? "Registration closed." : "Registration opened.",
                    )
                  }
                >
                  {form.status === "active" ? "Disable registration" : "Activate registration"}
                </Button>
              ) : null}
            </div>

            {form ? (
              <form
                className="mt-6 grid gap-4"
                action={(formData) => run(() => saveRegistrationFormAction(formData), "Registration form saved.")}
              >
                <input type="hidden" name="id" value={form.id} />
                <div className="space-y-1.5">
                  <Label htmlFor="name">Registration form name</Label>
                  <Input id="name" name="name" defaultValue={form.name} required className="h-10" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Batch</Label>
                    <Input value={batch.batch_number} readOnly className="h-10 bg-muted/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email_domain">Institution email domain</Label>
                    <Input
                      id="email_domain"
                      name="email_domain"
                      defaultValue={displayEmailDomain(form.email_domain)}
                      required
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="slug">Public URL slug</Label>
                    <Input id="slug" name="slug" defaultValue={form.slug} required className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Registration number format</Label>
                    <div className="flex h-10 items-center rounded-lg border border-input px-2.5 text-sm text-muted-foreground">
                      XXXX <span className="ml-auto font-medium text-foreground">/{batch.batch_number}</span>
                    </div>
                  </div>
                </div>
                <input type="hidden" name="auto_approve" value={form.auto_approve ? "true" : "false"} />
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm">
                  <p className="font-medium">Student fields</p>
                  <p className="mt-2 text-muted-foreground">First name · Last name · IIM Calcutta email · Registration number</p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Public URL</p>
                  <p className="mt-2 break-all font-medium">{origin ? `${origin}${publicPath}` : publicPath}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        const origin = window.location.origin;
                        await navigator.clipboard.writeText(`${origin}${publicPath}`);
                        toast.success("Registration link copied.");
                      }}
                    >
                      Copy URL
                    </Button>
                    <a
                      href={`${publicPath}?preview=1`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline" }))}
                    >
                      Preview
                    </a>
                  </div>
                </div>
                <div>
                  <Button type="submit" disabled={pending}>
                    Save changes
                  </Button>
                </div>
              </form>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No registration form exists for this batch yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-border/80 bg-white p-5">
            <h2 className="font-medium">Batch retention</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Archive keeps students and logs. Permanent deletion removes the batch, every student in it, their QR
              credentials, logins, and all entry/exit records.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {batch.status === "active" ? (
                archiveOpen ? (
                  <div className="w-full space-y-3 rounded-xl border border-border/80 bg-muted/30 p-4">
                    <p className="text-sm">
                      Archive {batch.name}? Students stay historically associated with this batch and entry/exit logs
                      are retained. They will no longer appear as active campus users.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => archiveBatchAction(batch.id), "Batch archived.")}
                      >
                        Confirm archive
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setArchiveOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" disabled={pending} onClick={() => setArchiveOpen(true)}>
                    Archive batch
                  </Button>
                )
              ) : (
                <AccountStatusBadge status="archived" />
              )}
              <Button variant="destructive" type="button" onClick={() => setDeleteOpen((open) => !open)}>
                Delete batch permanently
              </Button>
            </div>
            {deleteOpen ? (
              <div className="mt-4 space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm">
                  Type <span className="font-semibold">DELETE BATCH {batch.batch_number}</span> to permanently delete
                  this batch, its students, and all related entry/exit records. This cannot be undone.
                </p>
                <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-10" />
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    run(() => deleteBatchPermanentlyAction(batch.id, confirmation), "Batch deleted.")
                  }
                >
                  Permanently delete batch
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Registered" value={counts.registered} />
            <Stat label="Approved" value={counts.approved} />
            <Stat label="Pending" value={counts.pending} />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search registrations..." className="h-10 sm:max-w-xs" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={nativeSelectClass} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          {studentToDelete ? (
            <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm">
                Permanently delete {studentToDelete.full_name}? Type{" "}
                <span className="font-semibold">{studentToDelete.roll_number || studentToDelete.email}</span> to
                continue. Their login, QR, and entry/exit records will also be deleted.
              </p>
              <Input
                value={studentConfirmation}
                onChange={(event) => setStudentConfirmation(event.target.value)}
                className="h-10 sm:max-w-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  disabled={pending || studentConfirmation !== (studentToDelete.roll_number || studentToDelete.email)}
                  onClick={() => {
                    const studentId = studentToDelete.id;
                    const expected = studentToDelete.roll_number || studentToDelete.email || "";
                    startTransition(async () => {
                      const result = await deleteStudentAction(studentId, expected);
                      if (result.error) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Student deleted.");
                      setStudentToDelete(null);
                      setStudentConfirmation("");
                      router.refresh();
                    });
                  }}
                >
                  Permanently delete student
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStudentToDelete(null);
                    setStudentConfirmation("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {visible.length === 0 ? (
            <EmptyState title="No registrations found." description="Students who register through the public form will appear here." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/80 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="border-b bg-muted/40 text-[11px] tracking-wide text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3">First name</th>
                      <th className="px-4 py-3">Last name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Registration number</th>
                      <th className="px-4 py-3">Batch</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Registered at</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((student) => (
                      <tr key={student.id} className="border-b last:border-0">
                        <td className="px-4 py-3">{student.first_name ?? student.full_name.split(" ")[0]}</td>
                        <td className="px-4 py-3">{student.last_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{student.email}</td>
                        <td className="px-4 py-3 font-medium">{student.roll_number ?? "—"}</td>
                        <td className="px-4 py-3">{student.batch ?? "—"}</td>
                        <td className="px-4 py-3">
                          <AccountStatusBadge status={student.registration_status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {student.registered_at ? formatCampusDateTime(student.registered_at) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {student.registration_status === "pending" ? (
                              <>
                                <Button
                                  size="sm"
                                  disabled={pending}
                                  onClick={() =>
                                    run(
                                      () => setRegistrationDecisionAction({ studentId: student.id, decision: "approved" }),
                                      "Registration approved.",
                                    )
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pending}
                                  onClick={() =>
                                    run(
                                      () =>
                                        setRegistrationDecisionAction({
                                          studentId: student.id,
                                          decision: "rejected",
                                          reason: "Rejected by administration.",
                                        }),
                                      "Registration rejected.",
                                    )
                                  }
                                >
                                  Reject
                                </Button>
                              </>
                            ) : null}
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={pending}
                              onClick={() => {
                                setStudentToDelete(student);
                                setStudentConfirmation("");
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
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/80 bg-white p-4">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 font-heading text-3xl font-semibold">{value}</p>
    </div>
  );
}
