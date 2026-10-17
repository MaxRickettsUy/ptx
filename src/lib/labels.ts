// The marks a slip can carry, shared by the server, the MCP tool and the card.

export type Model = "claude" | "chatgpt";

/** `model` is which model proposed or shaped the legs, or null when the user dictated the whole slip. */
export type SlipLabels = { human: boolean; model: Model | null; mock: boolean };

export const MODELS: { key: Model; name: string }[] = [
  { key: "claude", name: "Claude" },
  { key: "chatgpt", name: "ChatGPT" },
];

export function isModel(value: unknown): value is Model {
  return MODELS.some((m) => m.key === value);
}

export const FLAGS = [
  { key: "human", emoji: "🧑", name: "Human", hint: "You chose or shaped the legs" },
  { key: "mock", emoji: "🧪", name: "Mock", hint: "A what-if slip that was never submitted" },
] as const satisfies readonly { key: "human" | "mock"; emoji: string; name: string; hint: string }[];

export const MODEL_HINT = "proposed or shaped the legs";
