export default function PublicationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 md:px-10 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] md:text-4xl">
        Publications
      </h1>
      <p className="mt-4 text-base leading-relaxed text-[var(--muted)]">
        Research from our team behind StrokeChat, including the fine-tuned BiomedParse
        model used for stroke lesion detection and segmentation.
      </p>

      <article className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--border)] bg-[var(--panel-elevated)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
            CVPR Workshop
          </span>
          <span className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs font-medium text-[var(--muted)]">
            Poster
          </span>
        </div>

        <h2 className="mt-4 text-xl font-semibold leading-snug tracking-tight text-[var(--text)]">
          Fine-Tuning BiomedParse for Stroke Detection and Segmentation on CT:
          A Comparison with Gemini 2.5 Pro and GPT-5
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-[var(--text)]">
          Artun Gunturkun<sup>1</sup>, Halil Ibrahim Gulluk, PhD<sup>2</sup>,
          Ilker Ozgur Koska, MD, PhD<sup>3</sup>, Olivier Gevaert<sup>4</sup>
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
          <sup>1</sup> Henry M. Gunn High School · <sup>2</sup> Electrical Engineering, Stanford University ·{" "}
          <sup>3</sup> Department of Radiology, Acibadem Healthcare ·{" "}
          <sup>4</sup> Computational Medicine, Stanford University
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Presented as a poster at a CVPR Workshop.
        </p>

        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Abstract</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Stroke is the second leading cause of death worldwide, and rapid differentiation of
            ischemic from hemorrhagic stroke on CT is critical because the two demand
            fundamentally different treatments. We fine-tune BiomedParse — a biomedical
            foundation model pretrained across nine imaging modalities — for stroke detection and
            segmentation on non-contrast head CT, and benchmark it against zero-shot Gemini 2.5 Pro
            and GPT-5. Training uses the Teknofest-2021 Stroke Dataset (6,650 expert-annotated
            axial non-contrast CT slices from the Turkish Ministry of Health, 2019–2020), with the
            prompts &ldquo;stroke is present&rdquo;, &ldquo;bleeding is present&rdquo;, and
            &ldquo;normal and healthy&rdquo;. The fine-tuned model attains 95.2% accuracy and 85.8%
            F1 for ischemic stroke and 98.9% accuracy and 96.5% F1 for hemorrhage, substantially
            outperforming both general-purpose multimodal models: GPT-5 missed 97.3% of ischemic
            cases, while Gemini 2.5 Pro showed poor specificity and high false-alarm rates. Unlike
            single-task CNNs, BiomedParse produces pixel-level lesion masks alongside
            classification, enabling both triage and lesion delineation from a single model, and
            its broad pretraining yields strong performance under medical data scarcity.
          </p>
        </div>

        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Key results</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { v: "95.2%", k: "Ischemic accuracy" },
              { v: "85.8%", k: "Ischemic F1" },
              { v: "98.9%", k: "Hemorrhagic accuracy" },
              { v: "96.5%", k: "Hemorrhagic F1" },
            ].map((m) => (
              <div key={m.k} className="rounded-xl border border-[var(--border)] bg-[var(--panel-elevated)] p-3">
                <p className="text-lg font-semibold tabular-nums text-[var(--text)]">{m.v}</p>
                <p className="mt-0.5 text-xs leading-tight text-[var(--muted)]">{m.k}</p>
              </div>
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-[var(--muted)]">
            <li>Substantially outperforms zero-shot GPT-5 and Gemini 2.5 Pro on CT stroke.</li>
            <li>GPT-5 missed 97.3% of ischemic cases; Gemini 2.5 Pro showed poor specificity.</li>
            <li>One model yields both classification and pixel-level segmentation for triage and delineation.</li>
          </ul>
        </div>

        <p className="mt-5 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
          Corresponding author: <a href="mailto:gunturkunartun@gmail.com" className="text-[var(--accent)] hover:underline">gunturkunartun@gmail.com</a>
          <span className="mx-1.5">·</span>
          Manuscript link coming soon.
        </p>
      </article>

      <p className="mt-8 text-xs text-[var(--muted)]/60">
        StrokeChat · research prototype · not for clinical diagnosis or treatment.
      </p>
    </main>
  );
}
