"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ID_CARD_BUCKET } from "@/lib/registration/id-card";
import { cn } from "@/lib/utils";

export function StudentIdCardImage({
  path,
  alt = "Student ID card",
  className,
}: {
  path?: string | null;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    const supabase = createClient();
    void supabase.storage
      .from(ID_CARD_BUCKET)
      .createSignedUrl(path, 180)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setFailed(true);
          return;
        }
        setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path || failed) {
    return (
      <div
        className={cn(
          "flex aspect-[85.6/54] items-center justify-center rounded-xl border border-border/80 bg-muted/50 px-4 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        No ID card on file
      </div>
    );
  }

  if (!url) {
    return (
      <div
        className={cn("aspect-[85.6/54] animate-pulse rounded-xl bg-muted", className)}
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={cn("aspect-[85.6/54] w-full rounded-xl object-cover", className)} />
  );
}
