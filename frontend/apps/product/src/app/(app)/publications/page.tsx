export default function PublicationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 md:px-10 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] md:text-4xl">
        Publications
      </h1>
      <p className="mt-4 text-base leading-relaxed text-[var(--muted)]">
        Research from our team behind StrokeChat, including the fine-tuned BiomedParse
        model used for stroke lesion segmentation.
      </p>

      <div className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          Fine-tuned BiomedParse for stroke
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text)]">
          A BiomedParse model fine-tuned by our team for hemorrhage and ischemic
          lesion detection and segmentation on non-contrast CT brain imaging.
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Citation and manuscript link coming soon.
        </p>
      </div>

      <p className="mt-8 text-xs text-[var(--muted)]/60">
        StrokeChat · research prototype · not for clinical diagnosis or treatment.
      </p>
    </main>
  );
}
