export type AgentConversationSummary = {
  age: string;
  id: string;
  section: "2 weeks ago" | "Today";
  title: string;
};

export const agentConversations: readonly AgentConversationSummary[] = [
  {
    age: "31min",
    id: "reply-with-hello",
    section: "Today",
    title: "Reply with hello",
  },
  {
    age: "34min",
    id: "support-desk",
    section: "Today",
    title: "Create support workspace",
  },
  {
    age: "16d",
    id: "create-new-project",
    section: "2 weeks ago",
    title: "Create new project",
  },
];

export const demoAgentConversation = {
  createdAt: "Today at 10:24",
  title: "Create support workspace",
  turns: [
    {
      answer: [
        "I’ll create a minimal support workspace that can be refined later.",
        "Which channels should the first version support?",
      ],
      duration: "Worked for 12 seconds",
      result: false,
      thought:
        "I checked the available Plugins and found the pieces needed for a small support workflow.",
      user: "Create a customer support workspace",
    },
    {
      answer: ["I’ll start with email and web intake."],
      duration: "Worked for 7 seconds",
      result: false,
      thought:
        "I’m keeping the initial scope small and using only Plugins already available in this App.",
      user: "Use the sensible defaults",
    },
    {
      answer: ["Created the workspace."],
      duration: "Worked for 6 seconds",
      result: true,
      thought:
        "The App definition is ready with intake, routing, and a shared support queue.",
      user: "Continue",
    },
  ],
} as const;
