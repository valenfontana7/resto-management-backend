import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '@prisma/client';
import { AiProviderRouterService } from '../ai-platform/providers/ai-provider-router.service';
import { asOptionalString } from '../common/json-coerce';
import type { ProspectBundle } from '../prospect-importer/types';
import type { SalesPackageContent } from './types/sales-package.types';
import { SALES_PACKAGE_JSON_SCHEMA } from './types/sales-package.types';

@Injectable()
export class LeadSalesPackageGeneratorService {
  private readonly logger = new Logger(LeadSalesPackageGeneratorService.name);

  constructor(
    private readonly providerRouter: AiProviderRouterService,
    private readonly configService: ConfigService,
  ) {}

  async generate(
    bundle: ProspectBundle,
    demoUrl?: string,
  ): Promise<SalesPackageContent> {
    const businessName = bundle.prospect.businessName;
    const cuisine = bundle.business.cuisine.join(', ') || 'restaurante';
    const city = bundle.prospect.city ?? 'Argentina';
    const dishCount = bundle.menu.products.length;

    const prompt = `Generá un paquete comercial para vender Bentoo (SaaS white-label para restaurantes) a "${businessName}" (${cuisine}, ${city}).

Contexto del demo generado:
- Slug demo: ${bundle.builder?.bentooImport?.demoSlug ?? bundle.prospect.id}
- URL demo: ${demoUrl ?? 'pendiente'}
- ${dishCount} platos en ${bundle.menu.categories.length} categorías
- Propuesta de valor del negocio: ${bundle.business.positioning ?? bundle.business.description?.slice(0, 200) ?? 'N/A'}
- Problemas detectados: presencia digital limitada, sin web propia o menú online desactualizado

Reglas:
- Español rioplatense, tono consultivo (no agresivo)
- No inventar datos de contacto ni métricas verificadas
- businessImpact: confidence 0-1, estimaciones cualitativas o rangos conservadores
- premiumOpportunities: 3-5 upsells Bentoo (delivery, reservas, loyalty, analytics, etc.)
- objectionHandling: 4-6 objeciones típicas (precio, tiempo, "ya tengo Instagram", etc.)
- sellerChecklist: 5-8 ítems accionables para el vendedor antes de la reunión`;

    const model =
      this.configService.get<string>('LEADS_SALES_PACKAGE_MODEL')?.trim() ||
      'gemini-2.5-flash';
    const response = await this.providerRouter.complete({
      provider: AiProvider.GEMINI,
      model,
      prompt,
      responseJsonSchema: SALES_PACKAGE_JSON_SCHEMA as Record<string, unknown>,
      temperature: 0.4,
      maxOutputTokens: 8192,
    });
    const raw = JSON.parse(response.text) as Record<string, unknown>;

    const content: SalesPackageContent = {
      executiveSummary: asOptionalString(raw.executiveSummary),
      pitch: asOptionalString(raw.pitch),
      beforeAfter: Array.isArray(raw.beforeAfter)
        ? (raw.beforeAfter as SalesPackageContent['beforeAfter'])
        : [],
      improvementReport:
        typeof raw.improvementReport === 'object' && raw.improvementReport
          ? (raw.improvementReport as Record<string, string>)
          : {},
      premiumOpportunities: Array.isArray(raw.premiumOpportunities)
        ? (raw.premiumOpportunities as SalesPackageContent['premiumOpportunities'])
        : [],
      objectionHandling: Array.isArray(raw.objectionHandling)
        ? (raw.objectionHandling as SalesPackageContent['objectionHandling'])
        : [],
      businessImpact: Array.isArray(raw.businessImpact)
        ? (raw.businessImpact as SalesPackageContent['businessImpact'])
        : [],
      callToAction: asOptionalString(raw.callToAction),
      sellerChecklist: Array.isArray(raw.sellerChecklist)
        ? (raw.sellerChecklist as string[])
        : [],
      generatedAt: new Date().toISOString(),
    };

    content.markdown = this.toMarkdown(content, businessName, demoUrl);
    this.logger.log(`Sales package generated for ${businessName}`);
    return content;
  }

  toMarkdown(
    pkg: SalesPackageContent,
    businessName: string,
    demoUrl?: string,
  ): string {
    const lines: string[] = [
      `# Paquete comercial — ${businessName}`,
      '',
      `> Generado: ${pkg.generatedAt}`,
      demoUrl ? `> Demo: ${demoUrl}` : '',
      '',
      '## 1. Resumen ejecutivo',
      pkg.executiveSummary,
      '',
      '## 2. Pitch comercial',
      pkg.pitch,
      '',
      '## 3. Antes vs. después',
      '| Dimensión | Hoy | Con Bentoo |',
      '|-----------|-----|------------|',
      ...pkg.beforeAfter.map(
        (r) => `| ${r.dimension} | ${r.today} | ${r.withBentoo} |`,
      ),
      '',
      '## 4. Informe de mejoras',
    ];

    for (const [key, value] of Object.entries(pkg.improvementReport)) {
      lines.push(`### ${key}`, value, '');
    }

    lines.push('## 5. Oportunidades premium', '');
    for (const opp of pkg.premiumOpportunities.sort(
      (a, b) => a.priority - b.priority,
    )) {
      lines.push(`- **${opp.title}** — ${opp.roi}`);
    }

    lines.push('', '## 6. Manejo de objeciones', '');
    for (const obj of pkg.objectionHandling) {
      lines.push(`**${obj.objection}**`, obj.answer, '');
    }

    lines.push('## 7. Impacto estimado', '');
    for (const impact of pkg.businessImpact) {
      lines.push(
        `- **${impact.area}**: ${impact.estimate} (confianza ${Math.round(impact.confidence * 100)}%) — ${impact.basis}`,
      );
    }

    lines.push('', '## 8. Call to action', pkg.callToAction, '');
    lines.push('## Checklist vendedor', '');
    for (const item of pkg.sellerChecklist) {
      lines.push(`- [ ] ${item}`);
    }

    return lines.filter((l) => l !== undefined).join('\n');
  }
}
