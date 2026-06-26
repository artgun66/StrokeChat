import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ variant = "primary", className, ...rest }: Props) {
  const focus =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ring-offset)]";
  const base =
    "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 " +
    focus;
  const styles =
    variant === "primary"
      ? "bg-gradient-to-b from-[var(--accent)] to-[#2a4160] text-white shadow-sm shadow-[#0d1520]/50 ring-1 ring-white/10 hover:brightness-110"
      : "border border-[var(--border)]/90 bg-[var(--panel-elevated)]/80 text-white ring-1 ring-white/[0.04] hover:bg-white/6";
  return <button className={cn(base, styles, className)} {...rest} />;
}
