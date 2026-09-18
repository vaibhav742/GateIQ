import Link from "next/link";
import { formatCampusDate } from "@/lib/utils/format";
import type { StudentNotice } from "@/types/database";

export function StudentNoticeBoard({ notices }: { notices: StudentNotice[] }) {
  if (notices.length === 0) return null;

  return (
    <aside className="space-y-3">
      {notices.map((notice) => (
        <article
          key={notice.id}
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <p className="text-[11px] font-medium tracking-[0.16em] text-amber-800/80 uppercase">Notice</p>
          <p className="mt-2 text-sm leading-6 text-amber-950">{notice.body}</p>
          <p className="mt-3 text-xs text-amber-900/70">Visible until {formatCampusDate(notice.ends_at)}</p>
          {notice.audience === "missing_id" ? (
            <Link href="/student/profile" className="mt-3 inline-block text-sm font-medium text-amber-950 underline">
              Upload ID on Profile
            </Link>
          ) : null}
        </article>
      ))}
    </aside>
  );
}
