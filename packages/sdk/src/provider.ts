import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ParticipantInfo } from "@gambiarra/core/types";

export interface GambiarraOptions {
  hubUrl?: string;
  roomCode: string;
}

export interface GambiarraModel {
  id: string;
  nickname: string;
  model: string;
  endpoint: string;
}

interface ParticipantsResponse {
  participants: ParticipantInfo[];
}

interface ModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
    gambiarra?: {
      nickname: string;
      model: string;
      endpoint: string;
    };
  }>;
}

export interface GambiarraProvider {
  /** Use a specific participant by ID */
  participant: (
    id: string
  ) => ReturnType<ReturnType<typeof createOpenAICompatible>>;
  /** Use a specific model name (routes to first participant with that model) */
  model: (
    name: string
  ) => ReturnType<ReturnType<typeof createOpenAICompatible>>;
  /** Use any available participant */
  any: () => ReturnType<ReturnType<typeof createOpenAICompatible>>;
  /** List all participants in the room */
  listParticipants: () => Promise<ParticipantInfo[]>;
  /** List available models (OpenAI-compatible format) */
  listModels: () => Promise<GambiarraModel[]>;
  /** Base URL for direct API access */
  baseURL: string;
}

/**
 * Create a Gambiarra provider for use with AI SDK.
 *
 * @example
 * ```typescript
 * import { createGambiarra } from "gambiarra-sdk";
 * import { generateText } from "ai";
 *
 * const gambiarra = createGambiarra({ roomCode: "ABC123" });
 *
 * // Use any available participant
 * const result = await generateText({
 *   model: gambiarra.any(),
 *   prompt: "Hello!",
 * });
 *
 * // Use a specific participant
 * const result2 = await generateText({
 *   model: gambiarra.participant("participant-id"),
 *   prompt: "Hello!",
 * });
 *
 * // Use a specific model type
 * const result3 = await generateText({
 *   model: gambiarra.model("llama3"),
 *   prompt: "Hello!",
 * });
 * ```
 */
export function createGambiarra(options: GambiarraOptions): GambiarraProvider {
  const hubUrl = options.hubUrl ?? "http://localhost:3000";
  const baseURL = `${hubUrl}/rooms/${options.roomCode}/v1`;

  // Create the base OpenAI-compatible provider
  const createProvider = (modelId: string) => {
    const provider = createOpenAICompatible({
      baseURL,
      name: "gambiarra",
    });
    return provider(modelId);
  };

  return {
    participant: (id: string) => createProvider(id),
    model: (name: string) => createProvider(`model:${name}`),
    any: () => createProvider("*"),

    async listParticipants(): Promise<ParticipantInfo[]> {
      const response = await fetch(
        `${hubUrl}/rooms/${options.roomCode}/participants`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch participants: ${response.statusText}`);
      }
      const data = (await response.json()) as ParticipantsResponse;
      return data.participants;
    },

    async listModels(): Promise<GambiarraModel[]> {
      const response = await fetch(`${baseURL}/models`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = (await response.json()) as ModelsResponse;
      return data.data.map((m) => ({
        id: m.id,
        nickname: m.gambiarra?.nickname ?? m.owned_by,
        model: m.gambiarra?.model ?? m.id,
        endpoint: m.gambiarra?.endpoint ?? "",
      }));
    },

    baseURL,
  };
}

// Re-export types
export type { ParticipantInfo } from "@gambiarra/core/types";
