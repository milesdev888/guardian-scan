import { cn } from "@/lib/utils";
import type { Grade } from "@/lib/guardian/types";

const GRADE_STYLES: Record<Grade, string> = {
  A: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  B: "border-lime-500/40 bg-lime-500/10 text-lime-200",
  C: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  D: "border-orange-500/40 bg-orange-500/10 text-orange-200",
  F: "border-red-500/45 bg-red-500/10 text-red-300",
  U: "border-border bg-secondary text-muted-foreground",
};

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
  const dim =
    size === "lg"
      ? "h-20 w-20 text-5xl"
      : size === "sm"
        ? "h-8 w-8 text-sm"
        : "h-12 w-12 text-2xl";
  const mark = (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl border font-heading",
        dim,
        GRADE_STYLES[grade],
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
