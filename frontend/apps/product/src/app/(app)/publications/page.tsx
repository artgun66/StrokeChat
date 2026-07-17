export default function PublicationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 md:px-10 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] md:text-4xl">
        Publications
      </h1>
      <article className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://mmfm-biomed.github.io/#accepted"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-[var(--border)] bg-[var(--panel-elevated)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-widest text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            CVPR Workshop
          </a>
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
            Fast and accurate differentiation between ischemic and hemorrhagic stroke on computed
            tomography (CT) is critical for timely treatment decisions. While deep learning models
            such as CNNs and U-Nets have shown promise, they struggle with the irregular boundaries
            of early stroke findings and require large labeled datasets. Vision-language models
            (VLMs), integrating semantic medical knowledge with visual understanding, may overcome
            these limitations. In this study, we fine-tuned BiomedParse, a biomedical VLM, on the
            Teknofest-2021 Stroke Dataset (6,650 CT slices). We evaluated the fine-tuned model on
            ischemic and hemorrhagic stroke detection and compared its performance with zero-shot
            Gemini 2.5 Pro and GPT-5. The fine-tuned model achieved accuracy of 95.2% and F1 score
            of 85.8% for ischemic stroke detection, and accuracy of 98.9% and F1 score of 96.5% for
            hemorrhagic stroke detection, substantially outperforming both general-purpose
            multimodal models. Our results demonstrate that domain-specific fine-tuning of
            biomedical foundation models provides a scalable and high-performing approach to medical
            image analysis, while general large language models require domain-specific adaptation
            to perform reliably on such tasks.
          </p>
        </div>

        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        </div>

      </article>

      <p className="mt-8 text-xs text-[var(--muted)]/60">
        StrokeChat · research prototype · not for clinical diagnosis or treatment.
      </p>
    </main>
  );
}
