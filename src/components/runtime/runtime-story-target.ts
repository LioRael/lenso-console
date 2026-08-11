import type { RuntimeStory } from "../../data/mock-runtime";

export type RuntimeStoryTargetInput = {
  correlationId: string;
  nodeIdCandidates?: string[];
  providerCallId?: string;
  requestId?: string;
};

export type RuntimeStoryTarget = {
  storyId: string;
  nodeId?: string;
};

export function resolveRuntimeStoryTarget(
  stories: RuntimeStory[],
  input: RuntimeStoryTargetInput
): RuntimeStoryTarget {
  const story = findStoryByCorrelation(stories, input.correlationId);
  const nodeId = story ? findTargetNodeId(story, input) : firstCandidate(input);
  return {
    storyId: story?.id ?? input.correlationId,
    ...(nodeId ? { nodeId } : {}),
  };
}

export function findStoryByCorrelation(
  stories: RuntimeStory[],
  storyIdOrCorrelationId: string
) {
  return (
    stories.find(
      (story) =>
        story.id === storyIdOrCorrelationId ||
        story.correlationId === storyIdOrCorrelationId
    ) ?? null
  );
}

function findTargetNodeId(story: RuntimeStory, input: RuntimeStoryTargetInput) {
  const candidates = new Set(input.nodeIdCandidates);
  const exact = story.nodes.find((node) => candidates.has(node.id));
  if (exact) {
    return exact.id;
  }

  if (!(input.providerCallId || input.requestId)) {
    return firstCandidate(input);
  }

  return (
    story.nodes.find((node) => {
      const metadata = objectRecord(node.attributes.source_metadata);
      const attributes = objectRecord(node.attributes);
      return (
        stringValue(metadata.provider_call_id) === input.providerCallId ||
        stringValue(attributes.provider_call_id) === input.providerCallId ||
        stringValue(metadata.request_id) === input.requestId ||
        stringValue(attributes.request_id) === input.requestId
      );
    })?.id ?? firstCandidate(input)
  );
}

function firstCandidate(input: RuntimeStoryTargetInput) {
  return input.nodeIdCandidates?.find((candidate) => candidate.length > 0);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
