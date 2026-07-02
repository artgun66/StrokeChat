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
          Stroke Assistant
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-[var(--text)] md:text-5xl">
          Your guide to{" "}
          <span className="bg-gradient-to-r from-[var(--text)] via-white to-[var(--link)] bg-clip-text text-transparent">
            understanding stroke
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--muted)]">
          Ask questions about stroke in plain language, or upload a CT scan for AI-powered
          detection and segmentation of hemorrhagic and ischemic lesions — all running
          locally on your device.
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

      {/* ── Disclaimer ─────────────────────────────────────────────────────── */}
      <p className="mt-10 text-[11px] leading-relaxed text-[var(--muted)]/50">
        Research prototype by Artun Gunturkun &mdash; Henry M. Gunn High School, Palo Alto.
        Not intended for clinical diagnosis or treatment. Always consult a qualified physician.
      </p>

    </main>
  );
}
