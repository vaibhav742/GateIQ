"use client";

import { useState } from "react";
import { QRScanner } from "@/components/security/QRScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampusStatusBadge } from "@/components/status/CampusStatusBadge";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/config/campus";
import { formatCampusTime } from "@/lib/utils/format";
import {
  asRpcPayload,
  scanErrorCopy,
  type LookupSuccess,
  type MovementSuccess,
  type RpcFailure,
} from "@/types/movement";

type Phase =
  | { kind: "scan"; busy?: boolean }
  | { kind: "lookup"; data: LookupSuccess }
  | { kind: "recorded"; data: MovementSuccess }
  | { kind: "error"; title: string; message: string };

export function ScanExperience({ gateName }: { gateName: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "scan" });
  const [manualToken, setManualToken] = useState("");
  const demo = isDemoMode();

  async function lookup(token: string) {
    setPhase({ kind: "scan", busy: true });
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("lookup_student_by_qr", {
        p_qr_token: token,
      });
      if (error) {
        const copy = scanErrorCopy("NETWORK", error.message);
        setPhase({ kind: "error", ...copy });
        return;
      }
      const payload = asRpcPayload<LookupSuccess | RpcFailure>(data);
      if (!payload.success) {
        const copy = scanErrorCopy(payload.code, payload.message);
        setPhase({ kind: "error", ...copy });
        return;
      }
      setPhase({ kind: "lookup", data: payload });
    } catch {
      setPhase({
        kind: "error",
        title: "Connection lost",
        message: "Unable to contact the campus server. Please check your connection and try again.",
      });
    }
  }

  async function record() {
    const value = sessionStorage.getItem("campus-last-token");
    if (!value) return;

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("record_campus_movement", {
        p_qr_token: value,
      });
      if (error) {
        const copy = scanErrorCopy("NETWORK", error.message);
        setPhase({ kind: "error", ...copy });
        return;
      }
      const payload = asRpcPayload<MovementSuccess | RpcFailure>(data);
      if (!payload.success) {
        const copy = scanErrorCopy(payload.code, payload.message);
        setPhase({ kind: "error", ...copy });
        return;
      }
      setPhase({ kind: "recorded", data: payload });
    } catch {
      setPhase({
        kind: "error",
        title: "Connection lost",
        message: "Unable to contact the campus server. Please check your connection and try again.",
      });
    }
  }

  function reset() {
    setPhase({ kind: "scan" });
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      {phase.kind === "scan" ? (
        <>
          <QRScanner
            paused={phase.busy}
            onScan={(value) => {
              sessionStorage.setItem("campus-last-token", value);
              void lookup(value);
            }}
          />
          <p className="text-center text-sm text-muted-foreground">
            {phase.busy ? "Verifying student..." : `Align the student QR within the frame · ${gateName}`}
          </p>
          {demo ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                sessionStorage.setItem("campus-last-token", manualToken);
                void lookup(manualToken);
              }}
            >
              <Input
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                placeholder="Demo: paste QR token"
                aria-label="QR token"
              />
              <Button type="submit">Lookup</Button>
            </form>
          ) : null}
        </>
      ) : null}

      {phase.kind === "lookup" ? (
        <div className="rounded-2xl border border-border/80 bg-white p-6">
          <p className="text-sm font-medium text-emerald-700">Verified</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold">{phase.data.student.name}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Roll number</dt>
              <dd className="mt-1 font-medium">{phase.data.student.roll_number ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Batch</dt>
              <dd className="mt-1 font-medium">{phase.data.student.batch ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Section</dt>
              <dd className="mt-1 font-medium">{phase.data.student.section ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Current status</dt>
              <dd className="mt-1">
                <CampusStatusBadge status={phase.data.campus_status} />
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">Gate · {phase.data.gate?.name ?? gateName}</p>
          <Button
            className="mt-6 h-12 w-full text-base"
            size="lg"
            onClick={() => void record()}
          >
            Record {phase.data.next_action === "ENTRY" ? "entry" : "exit"}
          </Button>
          <Button className="mt-2 h-11 w-full" variant="ghost" onClick={reset}>
            Cancel
          </Button>
        </div>
      ) : null}

      {phase.kind === "recorded" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 text-center">
          <p className="text-sm font-medium text-emerald-800">
            {phase.data.action} recorded
          </p>
          <h2 className="mt-2 font-heading text-2xl font-semibold">{phase.data.student.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{phase.data.student.roll_number}</p>
          <p className="mt-4 text-sm">
            {phase.data.gate} · {formatCampusTime(phase.data.timestamp)}
          </p>
          <div className="mt-4 flex justify-center">
            <CampusStatusBadge status={phase.data.status} />
          </div>
          <Button className="mt-6 h-12 w-full text-base" size="lg" onClick={reset}>
            Scan next
          </Button>
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <div className="rounded-2xl border border-border bg-white p-6 text-center">
          <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            {phase.title}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">{phase.message}</p>
          <Button className="mt-6 h-12 w-full" size="lg" onClick={reset}>
            Scan again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
