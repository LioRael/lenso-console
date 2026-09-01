export function hasAgentConversation(
  conversationId: string | undefined,
  turnCount: number
) {
  return Boolean(
    (conversationId && conversationId !== "new-task") || turnCount > 0
  );
}
