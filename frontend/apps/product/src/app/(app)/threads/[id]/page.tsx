import { notFound } from "next/navigation";
import { serverApi } from "../../../../lib/server-api";
import { ThreadsSidebar } from "../../../../components/ThreadsSidebar";
import { ThreadView, type AvailableModel } from "./ThreadView";

type Params = { id: string };

export default async function ThreadPage(props: { params: Promise<Params> }) {
  const { id } = await props.params;
  const { threads, models, catalog } = serverApi();

  let thread;
  try {
    thread = await threads.get(id);
  } catch {
    notFound();
  }

  const [list, msgs, modelsList, catalogList] = await Promise.all([
    threads.list(),
    threads.listMessages(id),
    models.list(),
    catalog.list(),
  ]);

  // Cross-reference downloaded models with the catalog so the chat UI knows
  // which selected model accepts images. Slugs not in the active catalog
  // (older deprecated downloads) default to vision_enabled=false.
  const visionBySlug = new Map<string, boolean>();
  for (const m of catalogList.results) visionBySlug.set(m.slug, !!m.vision_enabled);

  const ready: AvailableModel[] = modelsList.results
    .filter((m) => m.status === "ready")
    .map((m) => ({
      slug: m.catalog_slug,
      visionEnabled: visionBySlug.get(m.catalog_slug) ?? false,
    }));

  return (
    <div className="flex h-full bg-black/10">
      <ThreadsSidebar threads={list.results} activeId={id} />
      <main className="flex-1">
        <ThreadView
          threadId={id}
          initialModelSlug={thread.model_slug || ready[0]?.slug || ""}
          initialSystemPrompt={thread.system_prompt || ""}
          availableModels={ready}
          initialMessages={msgs.results}
        />
      </main>
    </div>
  );
}
