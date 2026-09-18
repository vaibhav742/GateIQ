"use client";

import { useState } from "react";
import { QRScanner } from "@/components/security/QRScanner";
import { StudentIdCardImage } from "@/components/security/StudentIdCardImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampusStatusBadge } from "@/components/status/CampusStatusBadge";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/config/campus";
import { formatCampusTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  normalizeRegistrationNumber,
  verificationMethodLabel,
} from "@/lib/registration/format";
import {
  asRpcPayload,
  scanErrorCopy,
  type LookupSuccess,
  type MovementSuccess,
  type RpcFailure,
  type ScanStudentCard,
} from "@/types/movement";

type ScanMode = "qr" | "manual";
type ScanFlag = "expired" | "revoked";
type Phase =
  | { kind: "ready"; busy?: boolean }
  | { kind: "lookup"; data: LookupSuccess }
  | { kind: "recorded"; data: MovementSuccess }
  | {
      kind: "error";
      title: string;
      message: string;
      student?: ScanStudentCard;
      flag?: ScanFlag;
    };

export function ScanExperience({ gateName }: { gateName: string }) {
  const [mode, setMode] = useState<ScanMode>("qr");
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });
  const [manualToken, setManualToken] = useState("");
  const [rollInput, setRollInput] = useState("");
  const [lastRoll, setLastRoll] = useState("");
  const [verified, setVerified] = useState<LookupSuccess | null>(null);
  const [recordingAction, setRecordingAction] = useState<"ENTRY" | "EXIT" | null>(null);
  const demo = isDemoMode();

  function fail(payload: RpcFailure) {
    const copy = scanErrorCopy(payload.code, payload.message);
    setPhase({
      kind: "error",
      ...copy,
      student: payload.student,
      flag: payload.code === "QR_EXPIRED" ? "expired" : payload.code === "QR_REVOKED" ? "revoked" : undefined,
    });
  }

  function switchMode(next: ScanMode) {
    setMode(next);
    setPhase({ kind: "ready" });
    setRecordingAction(null);
  }

  async function lookupQr(token: string) {
    setPhase({ kind: "ready", busy: true });
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
        fail(payload);
        return;
      }
      setVerified(payload);
      setPhase({ kind: "lookup", data: payload });
    } catch {
      setPhase({
        kind: "error",
        title: "Connection lost",
        message: "Unable to contact the campus server. Please check your connection and try again.",
      });
    }
  }

  async function lookupRoll(raw: string) {
    const roll = normalizeRegistrationNumber(raw);
    if (!roll) {
      setPhase({
        kind: "error",
        title: "Check registration number",
        message: "Enter a registration number like 0308/63.",
      });
      return;
    }

    setLastRoll(roll);
    setPhase({ kind: "ready", busy: true });
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("lookup_student_by_roll", {
        p_roll_number: roll,
      });
      if (error) {
        const copy = scanErrorCopy("NETWORK", error.message);
        setPhase({ kind: "error", ...copy });
        return;
      }
      const payload = asRpcPayload<LookupSuccess | RpcFailure>(data);
      if (!payload.success) {
        fail(payload);
        return;
      }
      setVerified(payload);
      setPhase({ kind: "lookup", data: payload });
    } catch {
      setPhase({
        kind: "error",
        title: "Connection lost",
        message: "Unable to contact the campus server. Please check your connection and try again.",
      });
    }
  }

  async function recordQr() {
    const value = sessionStorage.getItem("campus-last-token");
    if (!value) return;

    setRecordingAction("ENTRY");
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
        fail(payload);
        return;
      }
      setPhase({ kind: "recorded", data: { ...payload, verification_method: payload.verification_method ?? "QR" } });
    } catch {
      setPhase({
        kind: "error",
        title: "Connection lost",
        message: "Unable to contact the campus server. Please check your connection and try again.",
      });
    } finally {
      setRecordingAction(null);
    }
  }

  async function recordManual(action: "ENTRY" | "EXIT") {
    if (!lastRoll) return;
    setRecordingAction(action);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("record_campus_movement_manual", {
        p_roll_number: lastRoll,
        p_action: action,
      });
      if (error) {
        const copy = scanErrorCopy("NETWORK", error.message);
        setPhase({ kind: "error", ...copy });
        return;
      }
      const payload = asRpcPayload<MovementSuccess | RpcFailure>(data);
      if (!payload.success) {
        fail(payload);
        return;
      }
      setPhase({
        kind: "recorded",
        data: { ...payload, verification_method: payload.verification_method ?? "MANUAL" },
      });
    } catch {
      setPhase({
        kind: "error",
        title: "Connection lost",
        message: "Unable to contact the campus server. Please check your connection and try again.",
      });
    } finally {
      setRecordingAction(null);
    }
  }

  function reset() {
    setPhase({ kind: "ready" });
    setVerified(null);
    setRecordingAction(null);
  }

  const lookup = phase.kind === "lookup" ? phase.data : null;
  const canEnter = lookup ? lookup.campus_status !== "INSIDE" : false;
  const canExit = lookup ? lookup.campus_status === "INSIDE" : false;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      {phase.kind === "ready" ? (
        <>
          <ModeSwitch mode={mode} onChange={switchMode} disabled={Boolean(phase.busy)} />

          {mode === "qr" ? (
            <>
              <QRScanner
                paused={phase.busy}
                onScan={(value) => {
                  sessionStorage.setItem("campus-last-token", value);
                  void lookupQr(value);
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
                    void lookupQr(manualToken);
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
          ) : (
            <form
              className="rounded-2xl border border-border/80 bg-white p-5"
              onSubmit={(event) => {
                event.preventDefault();
                void lookupRoll(rollInput);
              }}
            >
              <Label htmlFor="registration-number" className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Registration number
              </Label>
              <Input
                id="registration-number"
                value={rollInput}
                onChange={(event) => setRollInput(event.target.value)}
                placeholder="0308/63"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="mt-2 h-12 text-base"
                aria-describedby="registration-number-hint"
              />
              <p id="registration-number-hint" className="mt-2 text-sm text-muted-foreground">
                Use this if the student&apos;s phone is off or the QR cannot be scanned.
              </p>
              <Button className="mt-5 h-12 w-full text-base" size="lg" type="submit" disabled={phase.busy}>
                {phase.busy ? "Finding student..." : "Find student"}
              </Button>
            </form>
          )}
        </>
      ) : null}

      {phase.kind === "lookup" ? (
        <div className="rounded-2xl border border-border/80 bg-white p-6">
          <p className="text-sm font-medium text-emerald-700">
            {mode === "manual" ? "Student found" : "Verified"}
          </p>
          <div className="mt-4">
            <StudentIdCardImage path={phase.data.student.id_card_path} alt={`${phase.data.student.name} ID card`} />
          </div>
          <h2 className="mt-4 font-heading text-2xl font-semibold">{phase.data.student.name}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Registration no.</dt>
              <dd className="mt-1 font-medium">{phase.data.student.roll_number ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Batch</dt>
              <dd className="mt-1 font-medium">{phase.data.student.batch ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Hostel</dt>
              <dd className="mt-1 font-medium">{phase.data.student.hostel ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Room</dt>
              <dd className="mt-1 font-medium">{phase.data.student.room_number ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Current status</dt>
              <dd className="mt-1">
                <CampusStatusBadge status={phase.data.campus_status} />
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">Gate · {phase.data.gate?.name ?? gateName}</p>

          {mode === "qr" ? (
            <Button
              className="mt-6 h-12 w-full text-base"
              size="lg"
              disabled={recordingAction !== null}
              onClick={() => void recordQr()}
            >
              {recordingAction ? "Recording..." : `Record ${phase.data.next_action === "ENTRY" ? "entry" : "exit"}`}
            </Button>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                className="h-12 text-base"
                size="lg"
                variant={canEnter ? "default" : "outline"}
                disabled={!canEnter || recordingAction !== null}
                onClick={() => void recordManual("ENTRY")}
              >
                {recordingAction === "ENTRY" ? "Recording..." : "Enter"}
              </Button>
              <Button
                className="h-12 text-base"
                size="lg"
                variant={canExit ? "default" : "outline"}
                disabled={!canExit || recordingAction !== null}
                onClick={() => void recordManual("EXIT")}
              >
                {recordingAction === "EXIT" ? "Recording..." : "Exit"}
              </Button>
            </div>
          )}
          {mode === "manual" ? (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              {canExit
                ? "Student is inside. Record Exit, or cancel if this is the wrong person."
                : "Student is not inside. Record Enter, or cancel if this is the wrong person."}
            </p>
          ) : null}
          <Button className="mt-2 h-11 w-full" variant="ghost" onClick={reset}>
            Cancel
          </Button>
        </div>
      ) : null}

      {phase.kind === "recorded" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 text-center">
          <p className="text-sm font-medium text-emerald-800">
            {phase.data.action} recorded
            {phase.data.verification_method
              ? ` · ${verificationMethodLabel(phase.data.verification_method)}`
              : mode === "manual"
                ? " · Manual"
                : ""}
          </p>
          <div className="mx-auto mt-4 max-w-sm">
            <StudentIdCardImage path={verified?.student.id_card_path} alt={`${phase.data.student.name} ID card`} />
          </div>
          <h2 className="mt-4 font-heading text-2xl font-semibold">{phase.data.student.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{phase.data.student.roll_number}</p>
          <p className="mt-4 text-sm">
            {phase.data.gate} · {formatCampusTime(phase.data.timestamp)}
          </p>
          <div className="mt-4 flex justify-center">
            <CampusStatusBadge status={phase.data.status} />
          </div>
          <Button className="mt-6 h-12 w-full text-base" size="lg" onClick={reset}>
            {mode === "manual" ? "Look up next" : "Scan next"}
          </Button>
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <div
          className={cn(
            "rounded-2xl border p-6 text-center",
            phase.flag === "expired"
              ? "border-amber-300 bg-amber-50/80"
              : phase.flag === "revoked"
                ? "border-orange-200 bg-orange-50/70"
                : "border-border bg-white",
          )}
        >
          <p
            className={cn(
              "text-[11px] font-medium tracking-[0.16em] uppercase",
              phase.flag ? "text-amber-800" : "text-muted-foreground",
            )}
          >
            {phase.title}
          </p>
          {phase.student?.name ? (
            <div className="mx-auto mt-4 max-w-sm text-left">
              <StudentIdCardImage
                path={phase.student.id_card_path}
                alt={`${phase.student.name} ID card`}
              />
              <h2 className="mt-4 text-center font-heading text-2xl font-semibold">
                {phase.student.name}
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    Registration no.
                  </dt>
                  <dd className="mt-1 font-medium">{phase.student.roll_number ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Hostel</dt>
                  <dd className="mt-1 font-medium">{phase.student.hostel ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Room</dt>
                  <dd className="mt-1 font-medium">{phase.student.room_number ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Batch</dt>
                  <dd className="mt-1 font-medium">{phase.student.batch ?? "—"}</dd>
                </div>
              </dl>
            </div>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">{phase.message}</p>
          <Button className="mt-6 h-12 w-full" size="lg" onClick={reset}>
            {mode === "manual" ? "Try again" : "Scan again"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  mode: ScanMode;
  onChange: (mode: ScanMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Scan method">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "qr"}
        disabled={disabled}
        className={cn(
          "h-11 rounded-lg text-sm font-medium transition-colors",
          mode === "qr" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
        )}
        onClick={() => onChange("qr")}
      >
        Scan QR
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "manual"}
        disabled={disabled}
        className={cn(
          "h-11 rounded-lg text-sm font-medium transition-colors",
          mode === "manual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
        )}
        onClick={() => onChange("manual")}
      >
        Registration no.
      </button>
    </div>
  );
}
