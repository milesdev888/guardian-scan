import { cn } from "@/lib/utils";
import type { Grade } from "@/lib/guardian/types";
import { GRADE_TILE_CLASS } from "@/lib/guardian/grade-colors";
import { AA_PLATINUM } from "@/lib/guardian/aa-platinum";

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
        ? "h-[5.25rem] w-[6.5rem] gap-0.5"
        : "h-20 w-20 text-5xl"
      : size === "sm"
        ? isAa
          ? "h-10 w-12 gap-px"
          : "h-8 w-8 text-sm"
        : isAa
          ? "h-[3.25rem] w-16 gap-px"
          : "h-12 w-12 text-2xl";

  const letterSize =
    size === "lg" ? "text-[2.35rem] leading-none" : size === "sm" ? "text-sm leading-none" : "text-xl leading-none";
  const wordSize =
    size === "lg"
      ? "text-[0.7rem] tracking-[0.28em]"
      : size === "sm"
        ? "text-[0.4rem] tracking-[0.2em]"
        : "text-[0.5rem] tracking-[0.24em]";

  const mark = isAa ? (
    <div
      className={cn(
        "grade-aa-tile flex flex-col items-center justify-center rounded-xl",
        dim,
        className,
      )}
      aria-hidden={!labeled}
    >
      <span className={cn("grade-aa-metal font-heading", letterSize)}>AA</span>
      <span className={cn("grade-aa-metal font-heading lowercase leading-none", wordSize)}>
        {AA_PLATINUM.wordmark}
      </span>
    </div>
  ) : (
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
