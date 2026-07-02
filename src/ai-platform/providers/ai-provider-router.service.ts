import { Injectable } from '@nestjs/common';
import { AiProvider } from '@prisma/client';
import type {
  AiCompletionRequest,
  AiCompletionResponse,
} from '../types/ai-task.types';
import { GeminiProvider } from './gemini.provider';

@Injectable()
export class AiProviderRouterService {
  constructor(private readonly gemini: GeminiProvider) {}

  isAvailable(provider: AiProvider): boolean {
    switch (provider) {
      case AiProvider.GEMINI:
        return this.gemini.isAvailable();
      case AiProvider.OPENAI:
      case AiProvider.ANTHROPIC:
      case AiProvider.OPENROUTER:
      case AiProvider.GROQ:
      case AiProvider.DEEPSEEK:
        return false;
      default: {
        const _exhaustive: never = provider;
        return _exhaustive;
      }
    }
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    switch (request.provider) {
      case AiProvider.GEMINI:
        return this.gemini.complete(request);
      default:
        throw new Error(
          `Provider ${request.provider} not yet implemented. Configure GEMINI or add adapter.`,
        );
    }
  }
}
