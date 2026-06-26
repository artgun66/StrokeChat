"use client";

/**
 * Extract plain text from a PDF in the browser via pdfjs-dist.
 *
 * pdf.js is heavy (~1 MB) so we lazy-load it on first use. The worker is
 * served from a CDN for now, which is fine for dev / vendor-hosted use; for
 * a customer-controlled (Class A) on-prem install where outbound CDN access
 * is blocked, copy `pdf.worker.min.mjs` into `apps/product/public/` and
 * change `WORKER_SRC` below to `"/pdf.worker.min.mjs"`.
 */

import type * as PdfJsModule from "pdfjs-dist";

let cached: typeof PdfJsModule | null = null;

async function loadPdfjs(): Promise<typeof PdfJsModule> {
  if (cached) return cached;
  const mod = await import("pdfjs-dist");
  // pdfjs-dist v4 ships an ESM worker. Self-host it for offline-friendly
  // installs (see file header).
  mod.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${mod.version}/build/pdf.worker.min.mjs`;
  cached = mod;
  return mod;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  const pageTexts: string[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const text = await page.getTextContent();
    const pieces: string[] = [];
    for (const item of text.items) {
      // pdf.js emits TextItem (with .str) or TextMarkedContent (no .str).
      if ("str" in item && typeof item.str === "string") {
        pieces.push(item.str);
      }
    }
    pageTexts.push(pieces.join(" "));
    page.cleanup();
  }
  await doc.destroy();
  return pageTexts.join("\n\n");
}
