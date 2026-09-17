"use client";

import { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";

export function QRScanner({
  onScan,
  paused,
}: {
  onScan: (value: string) => void;
  paused?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-2xl bg-black">
      <div className="relative aspect-[3/4] w-full sm:aspect-video">
        {error ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/80">
            {error}
          </div>
        ) : (
          <Scanner
            formats={["qr_code"]}
            paused={paused}
            onScan={(codes) => {
              const value = codes[0]?.rawValue;
              if (value) onScan(value);
            }}
            onError={(err) => {
              setError(err.message || "Unable to start the camera.");
            }}
            constraints={{ facingMode: "environment" }}
            styles={{
              container: { width: "100%", height: "100%" },
              video: { objectFit: "cover" },
            }}
            components={{ torch: true, zoom: true }}
          />
        )}
      </div>
    </div>
  );
}
