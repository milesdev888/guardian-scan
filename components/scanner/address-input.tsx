"use client";

import { ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";

export function AddressInput({ defaultValue }: { defaultValue: string }) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">Contract or mint address</span>
      <ScanSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        name="address"
        defaultValue={defaultValue}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text").trim();
          if (!text) return;
          event.preventDefault();
          event.currentTarget.value = text;
          event.currentTarget.form?.requestSubmit();
        }}
        placeholder="Paste a Solana mint or 0x contract"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        className={cn(
          "h-14 w-full rounded-2xl border border-primary/25 bg-card/80 pr-4 pl-10 font-mono text-sm outline-none",
          "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      />
    </label>
  );
}
