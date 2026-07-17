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
  title: "StrokeChat — AI-powered stroke analysis",
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
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col px-0 sm:px-3">
          <header className="z-20 grid min-h-[4.5rem] shrink-0 grid-cols-1 gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 sm:mt-3 sm:rounded-2xl sm:border sm:px-5 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-4 md:py-0">
            <Link
              href="/"
              className="group min-w-0 justify-self-start rounded-2xl px-1 py-0.5 transition hover:bg-slate-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
            >
              <div className="flex items-center gap-2.5">
                <div className="min-w-0">
                  <div className="text-[15px] font-bold tracking-tight text-[var(--text)]">
                    StrokeChat
                  </div>
                  <p className="hidden text-[11px] leading-tight text-[var(--muted)] sm:block sm:max-w-[220px]">
                    AI-powered stroke analysis &amp; CT segmentation
                  </p>
                </div>
              </div>
            </Link>
            <nav
              className="flex min-w-0 items-center justify-start gap-1 overflow-x-auto rounded-full border border-[var(--border)] bg-[var(--bg)] p-1 md:justify-self-center"
              aria-label="Main"
            >
              <NavLink href="/threads">Chat</NavLink>
              <NavLink href="/biomedparse">Stroke Segmentation</NavLink>
              <NavLink href="/vessel-segmentation">Vessel Segmentation</NavLink>
            </nav>
            <div
              className="hidden justify-self-end rounded-full border border-[var(--border)] px-3 py-1 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)] md:block"
              aria-hidden
            >
              Research only
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto sm:py-3">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
