import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { NavLink } from "../components/NavLink";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "NeuroChat — AI-powered stroke analysis",
  description:
    "Ask questions about stroke and analyse CT scans with AI-powered segmentation. Research tool for stroke education and detection.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`h-full min-h-0 antialiased ${fontSans.className}`}>
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col">
          <header className="grid h-[4.25rem] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--border)]/90 bg-[var(--bg-elevated)]/80 px-4 backdrop-blur-md md:px-6">
            <Link
              href="/"
              className="group min-w-0 justify-self-start rounded-xl px-1 py-0.5 transition hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent)] shadow-[0_0_20px_color-mix(in_oklab,var(--accent)_40%,transparent)]"
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold tracking-tight text-[var(--text)]">
                    NeuroChat
                  </div>
                  <p className="hidden text-[11px] leading-tight text-[var(--muted)] sm:block sm:max-w-[220px]">
                    AI-powered stroke analysis &amp; CT segmentation
                  </p>
                </div>
              </div>
            </Link>
            <nav
              className="flex items-center justify-center justify-self-center rounded-full border border-white/[0.06] bg-white/[0.03] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              aria-label="Main"
            >
              <NavLink href="/threads">Chat</NavLink>
              <NavLink href="/biomedparse">BiomedParse</NavLink>
              <NavLink href="/vessel-segmentation">Vessels</NavLink>
            </nav>
            <div
              className="hidden text-right text-[11px] text-[var(--muted)] md:block"
              aria-hidden
            >
              Research prototype
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-[var(--bg)]/0 to-[#070a0e]/30">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
