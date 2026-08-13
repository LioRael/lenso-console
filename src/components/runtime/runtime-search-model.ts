import type { RuntimeStory } from "../../data/mock-runtime";

export type RuntimeSearchResult =
  | {
      kind: "story";
      id: string;
      title: string;
      subtitle: string;
      correlationId: string;
      storyId: string;
      nodeId?: string;
    }
  | {
      kind: "correlation";
      id: string;
      title: string;
      subtitle: string;
      correlationId: string;
    };

export function buildRuntimeSearchResults({
  query,
  stories,
  limit = 8,
}: {
  query: string;
  stories: RuntimeStory[];
  limit?: number;
}): RuntimeSearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const storyResults: RuntimeSearchResult[] = stories.flatMap((story) => {
    const matchesStory = [
      story.id,
      story.name,
      story.service,
      story.source,
      story.status,
      story.correlationId,
    ].some((value) => value.toLowerCase().includes(normalized));

    const matchingNodes = story.nodes.filter((node) =>
      [
        node.id,
        node.name,
        node.canonicalName ?? "",
        node.service,
        node.kind,
        node.status,
      ].some((value) => value.toLowerCase().includes(normalized))
    );

    return [
      ...(matchesStory
        ? [
            {
              kind: "story" as const,
              id: story.id,
              title: story.name,
              subtitle: `${story.status} · ${story.correlationId}`,
              correlationId: story.correlationId,
              storyId: story.id,
            },
          ]
        : []),
      ...matchingNodes.map<RuntimeSearchResult>((node) => ({
        kind: "story",
        id: node.id,
        title: node.name,
        subtitle: `${story.correlationId} · ${node.service}`,
        correlationId: story.correlationId,
        storyId: story.id,
        nodeId: node.id,
      })),
    ];
  });

  const correlations = Array.from(
    new Set(stories.map((story) => story.correlationId))
  )
    .filter((id) => id.toLowerCase().includes(normalized))
    .map<RuntimeSearchResult>((id) => ({
      kind: "correlation",
      id,
      title: id,
      subtitle: "Open correlation in Stories",
      correlationId: id,
    }));

  return [...storyResults, ...correlations].slice(0, limit);
}
