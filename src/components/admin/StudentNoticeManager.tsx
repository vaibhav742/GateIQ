"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nativeSelectClass } from "@/lib/utils";
import {
  createStudentNoticeAction,
  deleteStudentNoticeAction,
  endStudentNoticeAction,
} from "@/lib/admin/actions";
import { formatCampusDateTime } from "@/lib/utils/format";
import type { StudentNotice } from "@/types/database";

export function StudentNoticeManager({
  notices,
  missingIdCount,
}: {
  notices: StudentNotice[];
  missingIdCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [audience, setAudience] = useState<"missing_id" | "all">("missing_id");
  const now = Date.now();
  const active = notices.filter((notice) => new Date(notice.ends_at).getTime() > now);
  const expired = notices.filter((notice) => new Date(notice.ends_at).getTime() <= now);

  function run(action: () => Promise<{ error?: string; success?: boolean }>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
    });
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-white p-5">
      <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">Student notices</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Push a message to the student dashboard. It appears in the top-left panel for the selected students until it
        expires.
      </p>

      <form
        className="mt-4 grid gap-3"
        action={(formData) => run(() => createStudentNoticeAction(formData), "Notice pushed to student dashboards.")}
      >
        <div className="space-y-1.5">
          <Label htmlFor="notice_body">Message</Label>
          <Textarea
            id="notice_body"
            name="body"
            required
            maxLength={500}
            rows={4}
            placeholder="Students who do not upload their ID by 20 September will have their accounts disabled and penalties will be levied."
            className="min-h-24"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="notice_audience">Send to</Label>
            <select
              id="notice_audience"
              name="audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value as "missing_id" | "all")}
              className={nativeSelectClass}
            >
              <option value="missing_id">Students with missing ID cards</option>
              <option value="all">All students</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {audience === "missing_id"
                ? `Currently ${missingIdCount} student${missingIdCount === 1 ? "" : "s"} have no ID on file.`
                : "Every student dashboard will show this notice."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duration_days">Show for how many days</Label>
            <Input
              id="duration_days"
              name="duration_days"
              type="number"
              min={1}
              max={60}
              defaultValue={7}
              required
              className="h-10"
            />
          </div>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Pushing..." : "Push notice"}
          </Button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {active.length === 0 && expired.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notices yet.</p>
        ) : null}
        {active.map((notice) => (
          <NoticeRow
            key={notice.id}
            notice={notice}
            pending={pending}
            onEnd={() => run(() => endStudentNoticeAction(notice.id), "Notice ended.")}
            onDelete={() => run(() => deleteStudentNoticeAction(notice.id), "Notice deleted.")}
          />
        ))}
        {expired.map((notice) => (
          <NoticeRow
            key={notice.id}
            notice={notice}
            expired
            pending={pending}
            onDelete={() => run(() => deleteStudentNoticeAction(notice.id), "Notice deleted.")}
          />
        ))}
      </div>
    </section>
  );
}

function NoticeRow({
  notice,
  expired,
  pending,
  onEnd,
  onDelete,
}: {
  notice: StudentNotice;
  expired?: boolean;
  pending: boolean;
  onEnd?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/70 px-4 py-3">
      <p className="text-sm">{notice.body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {notice.audience === "missing_id" ? "Missing ID cards" : "All students"} ·{" "}
          {expired ? "Ended" : "Visible until"} {formatCampusDateTime(notice.ends_at)}
        </p>
        <div className="flex gap-2">
          {!expired && onEnd ? (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onEnd}>
              End now
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
