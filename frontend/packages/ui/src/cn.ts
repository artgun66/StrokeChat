// Tiny class-name joiner. Replace with clsx + tailwind-merge in Phase 2.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
