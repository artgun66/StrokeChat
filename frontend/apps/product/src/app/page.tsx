async function getBackendStatus() {
  const url = process.env.API_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${url}/healthz`, { cache: "no-store" });
    if (!res.ok) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

const CAPABILITIES = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-3.564-.69L3 20.25l1.64-4.418A8.964 8.964 0 013 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
    title: "Ask about stroke",
    description: "Ask anything about stroke types, symptoms, risk factors, treatment options, or recovery. The assistant answers using medical knowledge.",
    href: "/threads",
    cta: "Start chatting",
    accent: "from-[var(--accent-2)] to-[var(--accent)]",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.66 2.49m0 0L17 19m1.8-1.51L21 19m-3.2-1.51l-4.08-6.123M5 14.5L3 17m2-2.5l4.08-6.123" />
      </svg>
    ),
    title: "Analyse a CT scan",
    description: "Upload a non-contrast CT brain image. The AI segments and highlights hemorrhagic or ischemic lesions.",
    href: "/biomedparse",
    cta: "Upload scan",
    accent: "from-red-500/80 to-red-700/80",
  },
];


export default async function Page() {
  const status = await getBackendStatus();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 md:px-10 md:py-16">

      {/* ── Status dot ─────────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${status.ok ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400"}`} />
        <span className="text-xs text-[var(--muted)]">
          {status.ok ? "Assistant online" : "Assistant offline — start the backend to use"}
        </span>
      </div>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
          NeuroChat
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-[var(--text)] md:text-5xl">
          Your guide to{" "}
          <span className="bg-gradient-to-r from-[var(--text)] via-white to-[var(--link)] bg-clip-text text-transparent">
            understanding stroke
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--muted)]">
          Ask questions about stroke in plain language, or upload a CT scan for AI-powered
          detection and segmentation of hemorrhagic and ischemic lesions.
        </p>
      </div>

      {/* ── Combined card ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border)]/80 bg-[var(--panel)]/60 p-6">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">What you can do</p>
        <div className="flex flex-col divide-y divide-[var(--border)]/50">
          {CAPABILITIES.map((c) => (
            <div key={c.href} className="flex items-start gap-4 py-5 first:pt-0 last:pb-0">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${c.accent} text-white shadow-md`}>
                {c.icon}
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <p className="text-sm font-semibold text-[var(--text)]">{c.title}</p>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{c.description}</p>
              </div>
              <a
                href={c.href}
                className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-[var(--text)] transition hover:bg-white/[0.08]"
              >
                {c.cta}
                <svg className="h-3 w-3 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* ── Desktop download ───────────────────────────────────────────────── */}
      <div className="mt-8 rounded-2xl border border-[var(--border)]/80 bg-[var(--panel)]/60 p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Run locally</p>
            <p className="mt-1 text-base font-semibold text-[var(--text)]">Download the desktop app</p>
            <p className="mt-0.5 text-sm text-[var(--muted)]">
              Run NeuroChat fully offline — all inference on your own hardware, no account needed.
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/10">
            <svg className="h-5 w-5 text-[var(--text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
            </svg>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {/* macOS Apple Silicon */}
          <a
            href="https://github.com/artgun66/NeuroChat/releases/latest/download/NeuroChat-mac-arm64.dmg"
            download
            className="group flex flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3.5 transition hover:border-[var(--accent)]/40 hover:bg-white/[0.06]"
          >
            <svg className="h-7 w-7 shrink-0 text-[var(--text)]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">macOS — Apple Silicon</p>
              <p className="text-xs text-[var(--muted)]">M1 / M2 / M3 · .dmg</p>
            </div>
            <svg className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:translate-y-0.5 group-hover:text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </a>

          {/* macOS Intel */}
          <a
            href="https://github.com/artgun66/NeuroChat/releases/latest/download/NeuroChat-mac-x64.dmg"
            download
            className="group flex flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3.5 transition hover:border-[var(--accent)]/40 hover:bg-white/[0.06]"
          >
            <svg className="h-7 w-7 shrink-0 text-[var(--text)]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">macOS — Intel</p>
              <p className="text-xs text-[var(--muted)]">x86_64 · .dmg</p>
            </div>
            <svg className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:translate-y-0.5 group-hover:text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </a>

          {/* Windows */}
          <a
            href="https://github.com/artgun66/NeuroChat/releases/latest/download/NeuroChat-win-x64-setup.exe"
            download
            className="group flex flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-white/[0.03] px-4 py-3.5 transition hover:border-[var(--accent)]/40 hover:bg-white/[0.06]"
          >
            <svg className="h-7 w-7 shrink-0 text-[var(--text)]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 12V6.75l6-1.32v6.57H3zm17 0V5.25L10 3v9h10zm0 .75V18.75L10 21v-9h10zM3 18.75v-6H9v6.42l-6-1.32z"/>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">Windows</p>
              <p className="text-xs text-[var(--muted)]">Windows 10/11 64-bit · .exe</p>
            </div>
            <svg className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:translate-y-0.5 group-hover:text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </a>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          <p className="text-[11px] text-[var(--muted)]/70">
            First build in progress — downloads will be ready shortly.
            <a href="https://github.com/artgun66/NeuroChat/releases" target="_blank" rel="noopener noreferrer"
              className="ml-1 text-[var(--accent)] hover:underline">
              Check GitHub Releases
            </a>
          </p>
        </div>
        <p className="mt-1 text-[11px] text-[var(--muted)]/50">
          GPU with ≥ 8 GB VRAM recommended · macOS 13+ or Windows 10+
        </p>
      </div>

      {/* ── Disclaimer ─────────────────────────────────────────────────────── */}
      <p className="mt-8 text-[11px] leading-relaxed text-[var(--muted)]/50">
        NeuroChat &mdash; research prototype by Artun Gunturkun, Henry M. Gunn High School, Palo Alto.
        Not intended for clinical diagnosis or treatment. Always consult a qualified physician.
      </p>

    </main>
  );
}
