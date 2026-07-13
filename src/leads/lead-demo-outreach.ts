import type { Lead } from '@prisma/client';
import { deriveLeadDemoAdminUrlFromDemoUrl } from './leads-ai.helpers';
import type {
  LeadDemoOutreachOutput,
  LeadOutreachChannel,
} from './types/lead-ai.types';

export function leadHasOwnWebsite(
  lead: Pick<Lead, 'hasWebsite' | 'website'>,
): boolean {
  return Boolean(lead.hasWebsite || lead.website?.trim());
}

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

export function adminDemoLinkIntro(
  channel: LeadOutreachChannel,
  options?: { osOnly?: boolean },
): string {
  const osOnly = options?.osOnly ?? false;
  if (osOnly) {
    if (channel === 'instagram') return 'Sistema operativo (desde el cel):';
    if (channel === 'email')
      return 'Así verías el sistema operativo desde el celular:';
    return 'Así verías el sistema operativo desde el celular:';
  }
  if (channel === 'instagram') return 'Panel admin (desde el cel):';
  if (channel === 'email') return 'Así lo administrarías desde el celular:';
  return 'Y así lo manejarías desde el celular:';
}

export function stripPublicDemoUrlFromBody(
  body: string,
  demoUrl: string,
): string {
  const trimmedBody = body.trim();
  const trimmedDemoUrl = demoUrl.trim();
  if (!trimmedBody || !trimmedDemoUrl) return trimmedBody;

  const withoutUrl = trimmedBody.replaceAll(trimmedDemoUrl, '').trim();
  return withoutUrl
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      const normalized = line.trim();
      if (!normalized) return false;
      if (/^sitio\s*:/i.test(normalized)) return false;
      if (/^mir[aá]\s+el\s+sitio/i.test(normalized)) return false;
      if (/^pod[eé]s\s+ver\s+el\s+sitio/i.test(normalized)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function ensureAdminLinkInOutreachBody(
  body: string,
  adminDemoUrl: string,
  channel: LeadOutreachChannel,
  options?: { osOnly?: boolean },
): string {
  const trimmedAdmin = adminDemoUrl.trim();
  const trimmedBody = body.trim();
  if (!trimmedAdmin || trimmedBody.includes(trimmedAdmin)) {
    return trimmedBody;
  }
  return `${trimmedBody}\n\n${adminDemoLinkIntro(channel, options)}\n${trimmedAdmin}`;
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

  const sharedProspect = [
    'Prospecto:',
    `- Negocio: ${lead.businessName}`,
    `- Categoría: ${lead.category ?? 'restaurante'}`,
    `- Ciudad: ${lead.city ?? 'Argentina'}`,
    `- Contacto: ${lead.contactName ?? 'equipo del local'}`,
  ];

  if (leadHasOwnWebsite(lead)) {
    return [
      `Generá un paquete comercial listo para enviar por ${CHANNEL_LABELS[channel]}.`,
      channelGuide[channel],
      '',
      'IMPORTANTE: El prospecto YA TIENE sitio web propio.',
      'NO ofrezcas demo del sitio público ni hables de "armar la web".',
      'Enfocá el mensaje en el sistema operativo de Bentoo: pedidos, salón, cocina, caja, reservas y gestión unificada.',
      '',
      ...sharedProspect,
      `- Sitio web actual: ${lead.website ?? 'sí (ya tiene web propia)'}`,
      `- Demo del sistema operativo (panel admin): ${adminDemoUrl}`,
      '',
      'Requisitos:',
      '- El campo body debe ser el mensaje COMPLETO listo para copiar y pegar.',
      '- Incluí SOLO la URL del panel admin / sistema operativo.',
      '- NO incluyas la URL del sitio público ni menciones "mirá el sitio".',
      '- summary es una nota interna breve (max 200 caracteres) para el vendedor, no va en el mensaje al cliente.',
      '- callToAction opcional, corto.',
      '- Bentoo es el sistema operativo del restaurante: operación, pedidos, salón, cocina y cobros integrados.',
    ].join('\n');
  }

  return [
    `Generá un paquete comercial listo para enviar por ${CHANNEL_LABELS[channel]}.`,
    channelGuide[channel],
    '',
    ...sharedProspect,
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
  const hasWebsite = leadHasOwnWebsite(lead);
  const hook = hasWebsite
    ? 'preparamos una demo del sistema operativo para que vean cómo Bentoo unifica pedidos, salón, cocina y caja'
    : !lead.hasOnlineMenu
      ? 'armamos una demo de cómo se vería su local con web y menú digital propios'
      : !lead.hasReservations
        ? 'preparamos una demo con menú online y pedidos integrados'
        : 'preparamos una demo para mostrarles cómo Bentoo puede ordenar su operación digital';

  const cta = '¿La miramos 15 minutos esta semana?';
  const adminIntro = adminDemoLinkIntro(channel, { osOnly: hasWebsite });

  let body: string;
  let subject: string | undefined;

  if (hasWebsite) {
    if (channel === 'instagram') {
      body = `Hola ${name}! Soy de Bentoo. Para ${lead.businessName} ${hook}.\n\n${adminIntro} ${adminDemoUrl}\n\n${cta}`;
    } else if (channel === 'email') {
      subject = `Sistema operativo Bentoo para ${lead.businessName}`;
      body = `Hola ${name},\n\nTe escribo desde Bentoo. Para ${lead.businessName} ${hook}.\n\n${adminIntro}\n${adminDemoUrl}\n\n${cta}\n\nSaludos!`;
    } else {
      body = `Hola ${name}, ¿cómo estás? Te escribo de Bentoo. Para ${lead.businessName} ${hook}.\n\n${adminIntro}\n${adminDemoUrl}\n\n${cta}`;
    }
  } else if (channel === 'instagram') {
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
    const osOnly = leadHasOwnWebsite(lead);
    const cleanedBody = osOnly
      ? stripPublicDemoUrlFromBody(partial.body, demoUrl)
      : partial.body;
    return {
      demoUrl,
      adminDemoUrl: resolvedAdminDemoUrl,
      summary,
      channel,
      body: ensureAdminLinkInOutreachBody(
        cleanedBody,
        resolvedAdminDemoUrl,
        channel,
        { osOnly },
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
