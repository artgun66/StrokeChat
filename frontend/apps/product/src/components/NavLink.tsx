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
        "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition " +
        (active
          ? "bg-gradient-to-b from-white/12 to-white/[0.07] text-white shadow-sm ring-1 ring-white/10"
          : "text-[var(--muted)] hover:bg-white/6 hover:text-[var(--text)]")
      }
    >
      {children}
    </Link>
  );
}
