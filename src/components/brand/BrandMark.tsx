import Image from "next/image";
import { CAMPUS } from "@/config/campus";
import { cn } from "@/lib/utils";

const sizes = {
  sm: { box: "h-8 w-8", px: 32 },
  md: { box: "h-10 w-10", px: 40 },
  lg: { box: "h-32 w-32", px: 192 },
} as const;

export function CampusLogo({
  size = "md",
  className,
  priority,
}: {
  size?: keyof typeof sizes;
  className?: string;
  priority?: boolean;
}) {
  const spec = sizes[size];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        spec.box,
        className,
      )}
    >
      <Image
        src={CAMPUS.logo}
        alt={CAMPUS.name}
        width={spec.px}
        height={spec.px}
        priority={priority}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

export function BrandLockup({
  size = "md",
  align = "left",
  showTagline = true,
  priority,
}: {
  size?: keyof typeof sizes;
  align?: "left" | "center";
  showTagline?: boolean;
  priority?: boolean;
}) {
  const centered = align === "center";

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", centered && "flex-col gap-3 text-center")}>
      <CampusLogo size={size} priority={priority} />
      <div className="min-w-0">
        <p
          className={cn(
            "font-semibold tracking-tight",
            size === "lg" ? "font-heading text-3xl" : "text-sm",
          )}
        >
          {CAMPUS.product}
        </p>
        {showTagline ? (
          <p
            className={cn(
              "text-muted-foreground",
              size === "lg" ? "mt-1.5 text-sm" : "line-clamp-2 text-[11px] leading-tight",
            )}
          >
            {CAMPUS.tagline}
          </p>
        ) : null}
      </div>
    </div>
  );
}
