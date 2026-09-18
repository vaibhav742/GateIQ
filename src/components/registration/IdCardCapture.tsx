"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { overlayCropFromVideo, processIdCardBlob } from "@/lib/registration/id-card-image";

export function IdCardCapture({
  value,
  onChange,
  disabled,
}: {
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrl = useRef<string | null>(null);
  const [mode, setMode] = useState<"idle" | "camera" | "processing" | "captured">(value ? "captured" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  useEffect(() => {
    if (!value) {
      if (previewUrl.current) {
        URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = null;
      }
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = url;
    setPreview(url);
    setMode("captured");
  }, [value]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError("Camera access is needed to photograph your ID. You can also upload a photo.");
      setMode("idle");
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    const stage = stageRef.current;
    const frame = frameRef.current;
    if (!video || !stage || !frame || video.readyState < 2) return;

    setMode("processing");
    setError(null);
    try {
      const crop = overlayCropFromVideo(video, stage.getBoundingClientRect(), frame.getBoundingClientRect());
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Unable to capture the ID photo.");
      ctx.drawImage(video, 0, 0);
      const frameBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Unable to capture the ID photo."))), "image/jpeg", 0.92);
      });
      const file = await processIdCardBlob(frameBlob, crop);
      stopCamera();
      onChange(file);
    } catch {
      setError("Could not crop the ID. Hold the card inside the frame and try again.");
      setMode("camera");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMode("processing");
    setError(null);
    try {
      const processed = await processIdCardBlob(file);
      stopCamera();
      onChange(processed);
    } catch {
      setError("Could not read that photo. Use the front of your ID on a dark background.");
      setMode("idle");
    }
  }

  return (
    <div className="space-y-2">
      <Label>Front of ID card</Label>
      <p className="text-xs text-muted-foreground">
        Photograph the front of your campus ID. We crop it to the card and compress it for gate checks.
      </p>

      {mode === "captured" && preview ? (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Cropped student ID card" className="aspect-[85.6/54] w-full object-cover" />
        </div>
      ) : null}

      {mode === "camera" || mode === "processing" ? (
        <div ref={stageRef} className="relative overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            className="aspect-[3/4] w-full object-cover"
            autoPlay
            muted
            playsInline
          />
          <div
            ref={frameRef}
            className="pointer-events-none absolute left-1/2 top-1/2 w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-white"
            style={{ aspectRatio: "85.6 / 54", boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }}
          />
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white">
            {mode === "processing" ? "Cropping ID..." : "Fit the front of your ID inside the frame"}
          </p>
        </div>
      ) : null}

      {mode === "idle" ? (
        <div className="flex aspect-[85.6/54] items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-4 text-center text-sm text-muted-foreground">
          No ID photo yet
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {mode === "camera" ? (
          <>
            <Button type="button" className="h-10" disabled={disabled} onClick={() => void captureFrame()}>
              Capture ID
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => {
                stopCamera();
                setMode(value ? "captured" : "idle");
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button type="button" className="h-10" disabled={disabled} onClick={() => void startCamera()}>
              {value ? "Retake photo" : "Photograph ID"}
            </Button>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-input px-3 text-sm font-medium">
              Upload photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void onFile(file);
                }}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}
