export default function PublicationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 md:px-10 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] md:text-4xl">
        Publications
      </h1>
      <article className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://openreview.net/group?id=NeurIPS.cc/2026/Workshop/GenAI4Health_Demonstration_Paper_Track#tab-accept-poster"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-[var(--border)] bg-[var(--panel-elevated)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-widest text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            NeurIPS 2026
          </a>
        </div>

        <h2 className="mt-4 text-xl font-semibold leading-snug tracking-tight text-[var(--text)]">
          StrokeChat: A Locally Deployable Conversational Interface for
          Stroke-Imaging AI Models
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-[var(--text)]">
          Artun Gunturkun<sup>1</sup>, Halil Ibrahim Gulluk<sup>2</sup>, Burc Bassa<sup>3</sup>,{" "}
          Özgür Ilker Koska<sup>4</sup>, Olivier Gevaert<sup>5</sup>
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
          <sup>1</sup> Henry M. Gunn High School · <sup>2</sup> Electrical Engineering, Stanford University ·{" "}
          <sup>3</sup> Department of Neurology, Krankenhaus Nordwest ·{" "}
          <sup>4</sup> Department of Radiology, Acibadem Healthcare ·{" "}
          <sup>5</sup> Computational Medicine, Stanford University
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Demonstration Paper Track at NeurIPS 2026. Published 05 Oct 2026.
        </p>

        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Abstract</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            A growing number of AI models can detect, segment, and characterize stroke-related
            findings on brain imaging. However, many remain difficult for clinicians to access
            because they are distributed as model weights, code repositories, and technical
            pipelines. This access gap may be particularly important in smaller hospitals and
            resource-limited settings where immediate neuroradiology expertise is not continuously
            available. We developed <em>StrokeChat</em>, a clinician-facing platform that integrates
            stroke lesion detection and segmentation, ASPECTS estimation, cerebrovascular
            segmentation, and medical vision-language conversation within a single interface.
            StrokeChat is designed to run fully locally, as a downloadable application that can be
            installed on institutional hardware so that patient imaging never leaves the site; a web
            version is also available for convenient testing and demonstration. In a prospective
            evaluation, ten physicians (five neurologists and five radiologists) independently
            reviewed five de-identified CT/CTA cases each, yielding 50 case-level evaluations.
            StrokeChat illustrates a practical, locally deployable approach for translating
            specialized stroke-imaging AI models into an accessible, conversational decision-support
            environment that keeps imaging data on-site.
          </p>
        </div>

        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            <span className="font-semibold uppercase tracking-[0.2em]">Keywords</span>{" "}
            <span className="ml-1">
              stroke · conversational AI · vision-language models · medical image segmentation ·
              clinical decision support
            </span>
          </p>
        </div>

      </article>

      <article className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://mmfm-biomed.github.io/#accepted"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-[var(--border)] bg-[var(--panel-elevated)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-widest text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            CVPR 2026
          </a>
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
          Presented at CVPR 2026.
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

    </main>
  );
}
