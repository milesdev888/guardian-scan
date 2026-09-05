export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14">
      <p className="text-sm text-muted-foreground">Scanning… grades and patterns, not a verdict.</p>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-16 animate-pulse rounded-xl border border-border/60 bg-card/50"
          />
        ))}
      </div>
    </div>
  );
}
