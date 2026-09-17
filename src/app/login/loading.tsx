import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <Skeleton className="h-72 w-full max-w-sm rounded-2xl" />
    </div>
  );
}
