import type { AiProvider } from '@prisma/client';

export type AiTaskCategory = 'code' | 'ai';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
}

export interface SuggestedAction {
  key: string;
  label: string;
  taskKey?: string;
  payload?: Record<string, unknown>;
}

export interface AiTaskResult<TOutput = unknown> {
  output: TOutput;
  confidence?: number;
  suggestedActions?: SuggestedAction[];
  usage?: TokenUsage;
  provider?: AiProvider;
  model?: string;
  cacheHit?: boolean;
  cacheSavedUsd?: number;
}

export interface AiTaskContext {
  userId?: string;
  leadId?: string;
  savedSearchId?: string;
  taskId: string;
  parentTaskId?: string;
}

export interface AiTaskHandler<TInput = unknown, TOutput = unknown> {
  readonly key: string;
  readonly category: AiTaskCategory;
  readonly requiresApproval: boolean;
  readonly defaultModel?: string;
  readonly cacheTtlSeconds?: number;
  execute(ctx: AiTaskContext, input: TInput): Promise<AiTaskResult<TOutput>>;
}

export interface EnqueueTaskOptions {
  taskKey: string;
  input: Record<string, unknown>;
  leadId?: string;
  savedSearchId?: string;
  createdById?: string;
  scheduledAt?: Date;
  parentTaskId?: string;
  maxRetries?: number;
  runImmediately?: boolean;
}

export interface AiCompletionRequest {
  provider: AiProvider;
  model: string;
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseJsonSchema?: Record<string, unknown>;
  tools?: Array<{ googleSearch?: Record<string, never> }>;
}

export interface AiCompletionResponse {
  text: string;
  usage?: TokenUsage;
  raw?: unknown;
}
