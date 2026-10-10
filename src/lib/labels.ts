// The three marks a slip can carry, shared by the server, the MCP tool and the card.

export type SlipLabels = { human: boolean; model: boolean; mock: boolean };

export const LABELS = [
  { key: "human", emoji: "🧑", name: "Human", hint: "You chose or shaped the legs" },
  { key: "model", emoji: "🤖", name: "Model", hint: "The model proposed or shaped the legs" },
  { key: "mock", emoji: "🧪", name: "Mock", hint: "A what-if slip that was never submitted" },
] as const satisfies readonly { key: keyof SlipLabels; emoji: string; name: string; hint: string }[];
