import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)]/90 bg-[var(--panel)]/95 p-4 shadow-sm shadow-black/20 ring-1 ring-white/[0.04]",
        className,
      )}
      {...rest}
    />
  );
}
