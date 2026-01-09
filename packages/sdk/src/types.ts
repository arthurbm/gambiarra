// Re-export all types from core (DRY - zero duplication)

// Type exports
export type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  GenerationConfig,
  HubConfig,
  LlmMetrics,
  MachineSpecs,
  Model,
  ModelDeleted,
  NetworkConfig,
  OllamaConfig,
  ParticipantInfo,
  ParticipantStatus,
  RoomInfo,
} from "@gambiarra/core/types";
// Re-export Zod schemas for runtime validation (with Schema suffix to avoid conflicts)
// Re-export constants
export {
  GenerationConfig as GenerationConfigSchema,
  HEALTH_CHECK_INTERVAL,
  HubConfig as HubConfigSchema,
  LlmMetrics as LlmMetricsSchema,
  MachineSpecs as MachineSpecsSchema,
  NetworkConfig as NetworkConfigSchema,
  OllamaConfig as OllamaConfigSchema,
  PARTICIPANT_TIMEOUT,
  ParticipantInfo as ParticipantInfoSchema,
  ParticipantStatus as ParticipantStatusSchema,
  RoomInfo as RoomInfoSchema,
} from "@gambiarra/core/types";
