"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active =
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  return (
    <Link
      href={href}
      className={
        "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 " +
        (active
          ? "bg-white text-[var(--accent)] shadow-sm ring-1 ring-slate-200"
          : "text-[var(--muted)] hover:bg-white/80 hover:text-[var(--text)]")
      }
    >
      {children}
    </Link>
  );
}
