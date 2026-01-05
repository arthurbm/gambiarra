import { nanoid } from "nanoid";
import type {
  GenerationConfig,
  MachineSpecs,
  ParticipantInfo,
} from "./types.ts";

export interface CreateParticipantOptions {
  nickname: string;
  model: string;
  endpoint: string; // OpenAI-compatible API endpoint (Ollama, LM Studio, etc.)
  specs?: MachineSpecs;
  config?: GenerationConfig;
}

function create(options: CreateParticipantOptions): ParticipantInfo {
  const now = Date.now();
  return {
    id: nanoid(),
    nickname: options.nickname,
    model: options.model,
    endpoint: options.endpoint,
    specs: options.specs ?? {},
    config: options.config ?? {},
    status: "online",
    joinedAt: now,
    lastSeen: now,
  };
}

function mergeConfig(
  base: GenerationConfig,
  overrides?: Partial<GenerationConfig>
): GenerationConfig {
  return {
    ...base,
    ...overrides,
  };
}

export const Participant = {
  create,
  mergeConfig,
} as const;
