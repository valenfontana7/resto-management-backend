import type { Lead } from '@prisma/client';
import type {
  LeadBusinessDiagnosis,
  LeadMessageContent,
} from '../types/lead-ai.types';

export function buildDiagnosisPrompt(lead: Lead): string {
  return `Analiza este prospecto comercial para Bentoo:

Negocio: ${lead.businessName}
Categoria: ${lead.category ?? 'No especificada'}
Ciudad: ${lead.city ?? 'No especificada'}
Contacto: ${lead.contactName ?? 'No especificado'}
Sitio web: ${lead.website ?? 'No tiene'}
Instagram: ${lead.instagram ?? 'No tiene'}
WhatsApp: ${lead.whatsapp ?? 'No tiene'}

Capacidades digitales actuales:
- Tiene sitio web: ${lead.hasWebsite ? 'Si' : 'No'}
- Menu online: ${lead.hasOnlineMenu ? 'Si' : 'No'}
- Reservas online: ${lead.hasReservations ? 'Si' : 'No'}
- WhatsApp comercial: ${lead.hasWhatsapp ? 'Si' : 'No'}
- Ecommerce: ${lead.hasEcommerce ? 'Si' : 'No'}
- Sucursales: ${lead.branchCount}
- Score comercial Bentoo: ${lead.score}/100

Notas: ${lead.notes ?? 'Sin notas'}

Genera un diagnostico comercial, oportunidades, beneficios de Bentoo, objeciones probables y argumentos de venta.`;
}

export function buildMessagePrompt(
  lead: Lead,
  channel: 'instagram' | 'whatsapp' | 'email',
): string {
  const channelGuide = {
    instagram:
      'Mensaje corto para DM de Instagram (max 500 caracteres en body). Tono casual pero profesional.',
    whatsapp:
      'Mensaje para WhatsApp (max 800 caracteres). Tono conversacional, con saludo personalizado.',
    email:
      'Email comercial formal pero cercano. Inclui subject y body. Menciona beneficios concretos de Bentoo.',
  };

  return `Genera un mensaje comercial para canal ${channel}.
${channelGuide[channel]}

Prospecto:
- Negocio: ${lead.businessName}
- Categoria: ${lead.category ?? 'restaurante'}
- Ciudad: ${lead.city ?? 'Argentina'}
- Contacto: ${lead.contactName ?? 'equipo del local'}
- Sin sitio web: ${!lead.hasWebsite}
- Sin menu online: ${!lead.hasOnlineMenu}
- Sin reservas online: ${!lead.hasReservations}

Bentoo ofrece: sitio web propio, menu digital, pedidos online, reservas, delivery, cobros con MercadoPago, panel de gestion.`;
}

export function buildHeuristicDiagnosis(lead: Lead): LeadBusinessDiagnosis {
  const gaps: string[] = [];
  if (!lead.hasWebsite) gaps.push('sitio web propio');
  if (!lead.hasOnlineMenu) gaps.push('menu digital con pedidos');
  if (!lead.hasReservations) gaps.push('reservas online');
  if (!lead.hasWhatsapp) gaps.push('canal WhatsApp integrado');

  const diagnosis =
    gaps.length > 0
      ? `${lead.businessName} tiene oportunidades claras de digitalizacion: le faltan ${gaps.join(', ')}.`
      : `${lead.businessName} ya tiene presencia digital basica, pero puede optimizar operacion y conversion con Bentoo.`;

  return {
    diagnosis,
    opportunities: [
      !lead.hasWebsite && 'Crear sitio web profesional con marca propia',
      !lead.hasOnlineMenu && 'Habilitar menu online con pedidos directos',
      !lead.hasReservations && 'Agregar reservas online sin comisiones',
      lead.branchCount > 1 && 'Gestion centralizada multi-sucursal',
    ].filter(Boolean) as string[],
    bentooBenefits: [
      'Sitio web y menu digital en minutos, sin desarrolladores',
      'Pedidos, reservas y delivery en una sola plataforma',
      'Cobros online con la cuenta MercadoPago del restaurante',
      'Panel de gestion para cocina, mesas y analytics',
    ],
    probableObjections: [
      'Ya uso otra plataforma o redes sociales para pedidos',
      'No tengo tiempo para implementar algo nuevo',
      'Los clientes prefieren llamar o ir al local',
      'El costo mensual no se justifica todavia',
    ],
    salesArguments: [
      'Prueba gratuita para validar con pedidos reales',
      'Sin comision por pedido: el restaurante cobra directo',
      'Setup asistido en menos de una hora',
      'Aumenta ticket promedio con upselling en menu digital',
    ],
  };
}

export function buildHeuristicMessage(
  lead: Lead,
  channel: 'instagram' | 'whatsapp' | 'email',
): LeadMessageContent {
  const name = lead.contactName ?? 'equipo de ' + lead.businessName;
  const hook = !lead.hasWebsite
    ? 'vi que todavia no tienen sitio web propio'
    : !lead.hasOnlineMenu
      ? 'note que no tienen menu online con pedidos'
      : 'creo que Bentoo puede ayudarlos a vender mas online';

  const body =
    channel === 'instagram'
      ? `Hola ${name}! Soy de Bentoo. ${hook}. Ayudamos restaurantes como ${lead.businessName} a tener web, menu digital y pedidos online. Te interesa que te cuente mas?`
      : channel === 'whatsapp'
        ? `Hola ${name}, como estas? Te escribo de Bentoo. ${hook}. Trabajamos con restaurantes en ${lead.city ?? 'Argentina'} para digitalizar pedidos y reservas sin comisiones. Podemos charlar 10 minutos esta semana?`
        : `Hola ${name},\n\nTe contacto desde Bentoo porque ${hook}.\n\nBentoo es la plataforma que usan restaurantes para tener su propio sitio, menu digital, pedidos online y reservas, todo integrado.\n\nMe gustaria mostrarte como ${lead.businessName} podria empezar en menos de una hora.\n\nSaludos!`;

  return {
    subject:
      channel === 'email'
        ? `Propuesta para digitalizar ${lead.businessName}`
        : undefined,
    body,
    callToAction: 'Agendar una demo de 15 minutos',
  };
}
