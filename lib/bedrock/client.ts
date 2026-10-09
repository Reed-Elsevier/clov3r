import "server-only";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

let client: BedrockRuntimeClient | undefined;

/** Bedrock model to use, from `BEDROCK_MODEL_ID` (null when not configured). */
export function bedrockModelId(): string | null {
  return process.env.BEDROCK_MODEL_ID?.trim() || null;
}

/**
 * Single-turn call through the model-agnostic Converse API, so swapping
 * `BEDROCK_MODEL_ID` between providers needs no code change. Credentials come
 * from the default AWS provider chain (env, profile, or the ECS task role).
 */
export async function converse({
  system,
  user,
  maxTokens = 1024,
}: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const modelId = bedrockModelId();
  if (!modelId) throw new Error("BEDROCK_MODEL_ID is not set");

  client ??= new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  const res = await client.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: user }] }],
      inferenceConfig: { maxTokens, temperature: 0 },
    }),
  );

  return (res.output?.message?.content ?? []).map((block) => (block as { text?: string }).text ?? "").join("");
}
