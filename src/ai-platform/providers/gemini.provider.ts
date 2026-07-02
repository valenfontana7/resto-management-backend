import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AiProvider } from '@prisma/client';
import type {
  AiCompletionRequest,
  AiCompletionResponse,
  TokenUsage,
} from '../types/ai-task.types';

@Injectable()
export class GeminiProvider {
  readonly provider = AiProvider.GEMINI;
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenAI | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY')?.trim() ||
      this.configService.get<string>('GOOGLE_API_KEY')?.trim();
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.client) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const response = await this.client.models.generateContent({
      model: request.model,
      contents: request.prompt,
      config: {
        systemInstruction: request.systemInstruction,
        temperature: request.temperature ?? 0.4,
        maxOutputTokens: request.maxOutputTokens ?? 2048,
        ...(request.responseJsonSchema
          ? {
              responseMimeType: 'application/json',
              responseJsonSchema: request.responseJsonSchema,
            }
          : {}),
        ...(request.tools ? { tools: request.tools } : {}),
      },
    });

    const text = response.text?.trim() ?? '';
    const usage = this.extractUsage(response);

    return { text, usage, raw: response };
  }

  private extractUsage(response: {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      totalTokenCount?: number;
    };
  }): TokenUsage | undefined {
    const meta = response.usageMetadata;
    if (!meta) return undefined;

    return {
      promptTokens: meta.promptTokenCount ?? 0,
      completionTokens: meta.candidatesTokenCount ?? 0,
      reasoningTokens: meta.thoughtsTokenCount ?? 0,
    };
  }
}
