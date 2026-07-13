import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '@prisma/client';
import type {
  AiTaskContext,
  AiTaskHandler,
  AiTaskResult,
} from '../../ai-platform/types/ai-task.types';
import {
  LeadProspectPipelineService,
  type RunProspectPipelineOptions,
} from '../lead-prospect-pipeline.service';
import type { ProspectPipelineReport } from '../types/prospect-pipeline.types';

export interface RunProspectPipelineInput {
  leadId: string;
  skipImport?: boolean;
  skipImages?: boolean;
  skipSalesPackage?: boolean;
}

@Injectable()
export class RunProspectPipelineTask
  implements AiTaskHandler<RunProspectPipelineInput, ProspectPipelineReport>
{
  readonly key = 'leads.run_prospect_pipeline';
  readonly category = 'ai' as const;
  readonly requiresApproval = false;
  readonly cacheTtlSeconds = 0;

  private readonly logger = new Logger(RunProspectPipelineTask.name);

  constructor(
    private readonly pipeline: LeadProspectPipelineService,
    private readonly configService: ConfigService,
  ) {}

  get defaultModel(): string {
    return (
      this.configService.get<string>('LEADS_PROSPECT_BUNDLE_MODEL')?.trim() ||
      'gemini-2.5-flash'
    );
  }

  async execute(
    ctx: AiTaskContext,
    input: RunProspectPipelineInput,
  ): Promise<AiTaskResult<ProspectPipelineReport>> {
    const leadId = input.leadId ?? ctx.leadId;
    if (!leadId) {
      throw new Error('leadId requerido para ejecutar pipeline prospecto');
    }

    const options: RunProspectPipelineOptions = {
      importedBy: ctx.userId,
      skipImport: input.skipImport,
      skipImages: input.skipImages,
      skipSalesPackage: input.skipSalesPackage,
    };

    try {
      const report = await this.pipeline.run(leadId, options);
      return {
        output: report,
        confidence: report.success ? 0.88 : 0.35,
        provider: AiProvider.GEMINI,
        model: this.defaultModel,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`run_prospect_pipeline failed: ${message}`);
      throw error;
    }
  }
}
