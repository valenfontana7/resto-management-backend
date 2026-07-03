import type { Lead } from '@prisma/client';
import { deriveLeadDemoAdminUrlFromDemoUrl } from './leads-ai.helpers';
import type {
  LeadDemoOutreachOutput,
  LeadOutreachChannel,
} from './types/lead-ai.types';

export function pickLeadOutreachChannel(lead: Lead): LeadOutreachChannel {
  if (lead.whatsapp?.trim()) return 'whatsapp';
  if (lead.instagram?.trim()) return 'instagram';
  if (lead.email?.trim()) return 'email';
  return 'whatsapp';
}

const CHANNEL_LABELS: Record<LeadOutreachChannel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram DM',
  email: 'Email',
};

export function leadOutreachChannelLabel(channel: LeadOutreachChannel): string {
  return CHANNEL_LABELS[channel];
}

export function adminDemoLinkIntro(channel: LeadOutreachChannel): string {
  if (channel === 'instagram') return 'Panel admin (desde el cel):';
  if (channel === 'email') return 'Así lo administrarías desde el celular:';
  return 'Y así lo manejarías desde el celular:';
}

export function ensureAdminLinkInOutreachBody(
  body: string,
  adminDemoUrl: string,
  channel: LeadOutreachChannel,
): string {
  const trimmedAdmin = adminDemoUrl.trim();
  const trimmedBody = body.trim();
  if (!trimmedAdmin || trimmedBody.includes(trimmedAdmin)) {
    return trimmedBody;
  }
  return `${trimmedBody}\n\n${adminDemoLinkIntro(channel)}\n${trimmedAdmin}`;
}

export function buildDemoOutreachPrompt(
  lead: Lead,
  demoUrl: string,
  adminDemoUrl: string,
  channel: LeadOutreachChannel,
): string {
  const channelGuide = {
    instagram:
      'Mensaje corto para DM de Instagram (max 500 caracteres en body). Tono casual pero profesional.',
    whatsapp:
      'Mensaje para WhatsApp (max 800 caracteres). Tono conversacional, con saludo personalizado.',
    email:
      'Email comercial formal pero cercano. Incluí subject y body. El body debe incluir la URL de la demo.',
  };

  return [
    `Generá un paquete comercial listo para enviar por ${CHANNEL_LABELS[channel]}.`,
    channelGuide[channel],
    '',
    'Prospecto:',
    `- Negocio: ${lead.businessName}`,
    `- Categoría: ${lead.category ?? 'restaurante'}`,
    `- Ciudad: ${lead.city ?? 'Argentina'}`,
    `- Contacto: ${lead.contactName ?? 'equipo del local'}`,
    `- Demo del sitio (cliente): ${demoUrl}`,
    `- Panel admin demo (operación): ${adminDemoUrl}`,
    '',
    'Requisitos:',
    '- El campo body debe ser el mensaje COMPLETO listo para copiar y pegar.',
    '- Incluí las DOS URLs: sitio público y panel admin, con copy tipo "Así lo manejarías desde el celular" para el admin.',
    '- summary es una nota interna breve (max 200 caracteres) para el vendedor, no va en el mensaje al cliente.',
    '- callToAction opcional, corto.',
    '- Bentoo ofrece: sitio web propio, menú digital, pedidos online, reservas, delivery, cobros con MercadoPago.',
  ].join('\n');
}

export function buildHeuristicDemoOutreach(
  lead: Lead,
  demoUrl: string,
  adminDemoUrl: string,
  summary: string,
  channel: LeadOutreachChannel = pickLeadOutreachChannel(lead),
): LeadDemoOutreachOutput {
  const name = lead.contactName ?? `equipo de ${lead.businessName}`;
  const hook = !lead.hasWebsite
    ? 'armamos una demo de cómo se vería su local con web y menú digital propios'
    : !lead.hasOnlineMenu
      ? 'preparamos una demo con menú online y pedidos integrados'
      : 'preparamos una demo para mostrarles cómo Bentoo puede ordenar su operación digital';

  const cta = '¿La miramos 15 minutos esta semana?';
  const adminIntro = adminDemoLinkIntro(channel);

  let body: string;
  let subject: string | undefined;

  if (channel === 'instagram') {
    body = `Hola ${name}! Soy de Bentoo. Para ${lead.businessName} ${hook}.\n\nSitio: ${demoUrl}\n${adminIntro} ${adminDemoUrl}\n\n${cta}`;
  } else if (channel === 'email') {
    subject = `Demo Bentoo para ${lead.businessName}`;
    body = `Hola ${name},\n\nTe escribo desde Bentoo. Para ${lead.businessName} ${hook}.\n\nPodés ver el sitio acá:\n${demoUrl}\n\n${adminIntro}\n${adminDemoUrl}\n\n${cta}\n\nSaludos!`;
  } else {
    body = `Hola ${name}, ¿cómo estás? Te escribo de Bentoo. Para ${lead.businessName} ${hook}.\n\nMirá el sitio acá: ${demoUrl}\n\n${adminIntro}\n${adminDemoUrl}\n\n${cta}`;
  }

  return {
    demoUrl,
    adminDemoUrl,
    summary,
    channel,
    body,
    subject,
    callToAction: cta,
  };
}

export function normalizeDemoOutreachOutput(
  lead: Lead,
  demoUrl: string,
  adminDemoUrl: string,
  partial: Partial<LeadDemoOutreachOutput> & { summary?: string },
): LeadDemoOutreachOutput {
  const channel = partial.channel ?? pickLeadOutreachChannel(lead);
  const resolvedAdminDemoUrl =
    partial.adminDemoUrl?.trim() ||
    adminDemoUrl.trim() ||
    deriveLeadDemoAdminUrlFromDemoUrl(demoUrl);
  const summary =
    partial.summary?.trim() ||
    `Demo Bentoo para ${lead.businessName}: menú digital, pedidos online y reservas en una sola plataforma.`;

  if (partial.body?.trim()) {
    return {
      demoUrl,
      adminDemoUrl: resolvedAdminDemoUrl,
      summary,
      channel,
      body: ensureAdminLinkInOutreachBody(
        partial.body,
        resolvedAdminDemoUrl,
        channel,
      ),
      subject: partial.subject?.trim() || undefined,
      callToAction: partial.callToAction?.trim() || undefined,
    };
  }

  return buildHeuristicDemoOutreach(
    lead,
    demoUrl,
    resolvedAdminDemoUrl,
    summary,
    channel,
  );
}
