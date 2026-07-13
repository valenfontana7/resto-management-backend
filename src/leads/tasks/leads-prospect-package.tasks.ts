import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '@prisma/client';
import type {
  AiTaskContext,
  AiTaskHandler,
  AiTaskResult,
} from '../../ai-platform/types/ai-task.types';
import { LeadProspectBundleGeneratorService } from '../lead-prospect-bundle-generator.service';
import type { ProspectBundle } from '../../prospect-importer/types';

export interface GenerateProspectBundleInput {
  leadId: string;
  autoImport?: boolean;
}

export interface GenerateProspectBundleOutput {
  bundle: ProspectBundle;
  validation: {
    errors: string[];
    warnings: string[];
  };
  researchSummary: string;
  autoImport?: boolean;
}

@Injectable()
export class GenerateProspectBundleTask
  implements
    AiTaskHandler<GenerateProspectBundleInput, GenerateProspectBundleOutput>
{
  readonly key = 'leads.generate_prospect_bundle';
  readonly category = 'ai' as const;
  readonly requiresApproval = false;
  readonly cacheTtlSeconds = 3600;

  private readonly logger = new Logger(GenerateProspectBundleTask.name);

  constructor(
    private readonly generator: LeadProspectBundleGeneratorService,
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
    input: GenerateProspectBundleInput,
  ): Promise<AiTaskResult<GenerateProspectBundleOutput>> {
    const leadId = input.leadId ?? ctx.leadId;
    if (!leadId) {
      throw new Error('leadId requerido para generar paquete prospecto');
    }

    try {
      const result = await this.generator.generateForLead(leadId);

      if (result.validation.errors.length > 0) {
        this.logger.warn(
          `Bundle generado con ${result.validation.errors.length} errores de validación`,
        );
      }

      return {
        output: {
          bundle: result.bundle,
          validation: result.validation,
          researchSummary: result.researchSummary,
          autoImport: input.autoImport ?? false,
        },
        confidence:
          result.validation.errors.length === 0
            ? Math.min(0.85, 0.5 + result.bundle.menu.products.length * 0.01)
            : 0.4,
        provider: AiProvider.GEMINI,
        model: result.model,
        suggestedActions:
          result.validation.errors.length === 0
            ? [
                {
                  key: 'import',
                  label: 'Importar paquete a demo',
                  taskKey: 'leads.import_prospect_bundle',
                },
              ]
            : [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`generate_prospect_bundle failed: ${message}`);
      throw error;
    }
  }
}
