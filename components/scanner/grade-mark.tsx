import { cn } from "@/lib/utils";
import type { Grade } from "@/lib/guardian/types";
import { GRADE_TILE_CLASS } from "@/lib/guardian/grade-colors";

export function GradeMark({
  grade,
  size = "md",
  className,
  labeled = false,
}: {
  grade: Grade;
  size?: "sm" | "md" | "lg";
  className?: string;
  labeled?: boolean;
}) {
  const isAa = grade === "AA";
  const dim =
    size === "lg"
      ? isAa
        ? "h-20 w-24 text-4xl"
        : "h-20 w-20 text-5xl"
      : size === "sm"
        ? isAa
          ? "h-8 w-10 text-xs"
          : "h-8 w-8 text-sm"
        : isAa
          ? "h-12 w-14 text-xl"
          : "h-12 w-12 text-2xl";
  const mark = (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl border font-heading tracking-tight",
        dim,
        GRADE_TILE_CLASS[grade],
        className,
      )}
      aria-hidden={!labeled}
    >
      {grade}
    </div>
  );
  if (!labeled) return mark;
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
        Grade
      </p>
      {mark}
    </div>
  );
}
