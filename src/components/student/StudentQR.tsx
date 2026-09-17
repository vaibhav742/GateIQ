"use client";

import { QRCodeSVG } from "qrcode.react";
import { encodeQrPayload } from "@/lib/utils/format";
import { AccountStatusBadge } from "@/components/status/CampusStatusBadge";

export function StudentQR({
  token,
  name,
  rollNumber,
  batch,
  qrStatus,
}: {
  token: string;
  name: string;
  rollNumber: string | null;
  batch: string | null;
  qrStatus: string;
}) {
  const payload = encodeQrPayload(token);

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-3xl border border-border/80 bg-white p-5 text-center shadow-[0_8px_30px_rgba(16,24,40,0.06)] sm:p-8">
        <p className="text-[11px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
          My campus ID
        </p>
        <h1 className="mt-3 font-heading text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {batch ? `PGP ${batch}` : "IIM Calcutta"}
          {rollNumber ? ` · Roll No. ${rollNumber}` : ""}
        </p>
        <div className="mx-auto mt-6 flex aspect-square w-full max-w-[240px] items-center justify-center rounded-2xl bg-white p-3 ring-1 ring-border">
          <QRCodeSVG
            value={payload}
            size={216}
            level="M"
            includeMargin={false}
            className="h-auto w-full"
          />
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Present this QR at the campus gate.
        </p>
        <div className="mt-4 flex justify-center">
          <AccountStatusBadge status={qrStatus} />
        </div>
      </div>
    </div>
  );
}
