import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-64" />
      </div>
      <Skeleton className="h-52 rounded-2xl" />
      <Skeleton className="h-28 rounded-xl" />
    </div>
  );
}
