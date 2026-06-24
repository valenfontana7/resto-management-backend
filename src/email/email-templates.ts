/**
 * Sistema de diseño compartido para emails transaccionales.
 * Tono: profesional, cálido y claro. Compatible con clientes de correo (tablas + inline styles).
 */

import { getEmailPublicBaseUrl } from '../common/utils/email-public-base-url.util';

export interface OrderData {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  type: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  tip: number;
  total: number;
  deliveryAddress?: string | null;
  deliveryNotes?: string | null;
  publicTrackingToken?: string | null;
  notes?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    notes?: string | null;
  }>;
}

export interface RestaurantData {
  id: string;
  name: string;
  slug?: string | null;
  email: string;
  phone: string;
  address: string;
  logoUrl?: string | null;
}

export interface StatusConfig {
  title: string;
  subtitle: string;
  color: string;
  bgColor: string;
  borderColor: string;
  step: number;
  customerMessage: string;
  actionTip: string;
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  PENDING: {
    title: 'Esperando confirmación de pago',
    subtitle: 'Tu pedido está reservado',
    color: '#B45309',
    bgColor: '#FFFBEB',
    borderColor: '#FDE68A',
    step: 1,
    customerMessage:
      'Estamos aguardando la confirmación de tu pago para comenzar a preparar tu pedido.',
    actionTip:
      'Si ya realizaste el pago, puede demorar unos minutos en reflejarse. Te avisaremos en cuanto esté confirmado.',
  },
  PAID: {
    title: 'Pago confirmado',
    subtitle: 'Recibimos tu pago correctamente',
    color: '#0F766E',
    bgColor: '#F0FDFA',
    borderColor: '#99F6E4',
    step: 2,
    customerMessage:
      'Tu pago fue procesado con éxito. El restaurante recibirá tu pedido en breve.',
    actionTip: 'Te mantendremos informado en cada paso del proceso.',
  },
  CONFIRMED: {
    title: 'Pedido confirmado',
    subtitle: 'El restaurante ya lo recibió',
    color: '#0369A1',
    bgColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    step: 3,
    customerMessage:
      'Confirmamos tu pedido y pronto comenzaremos a prepararlo con el mismo cuidado de siempre.',
    actionTip:
      'El tiempo de preparación puede variar según la demanda del momento.',
  },
  PREPARING: {
    title: 'En preparación',
    subtitle: 'Tu pedido está en cocina',
    color: '#C2410C',
    bgColor: '#FFF7ED',
    borderColor: '#FED7AA',
    step: 4,
    customerMessage:
      'Nuestro equipo está preparando tu pedido. Gracias por tu paciencia.',
    actionTip: 'Te avisaremos en cuanto esté listo para entregar o retirar.',
  },
  READY: {
    title: 'Pedido listo',
    subtitle: 'Ya podés retirarlo o recibirlo',
    color: '#15803D',
    bgColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    step: 5,
    customerMessage: 'Tu pedido está listo. ¡Esperamos que lo disfrutes!',
    actionTip:
      'Si elegiste delivery, el repartidor está en camino. Si es retiro, podés acercarte al local.',
  },
  DELIVERED: {
    title: 'Pedido entregado',
    subtitle: 'Gracias por elegirnos',
    color: '#6D28D9',
    bgColor: '#F5F3FF',
    borderColor: '#DDD6FE',
    step: 6,
    customerMessage:
      'Esperamos que hayas disfrutado tu experiencia. Gracias por confiar en nosotros.',
    actionTip: 'Si te gustó, compartir tu experiencia nos ayuda muchísimo.',
  },
  CANCELLED: {
    title: 'Pedido cancelado',
    subtitle: 'Lamentamos el inconveniente',
    color: '#B91C1C',
    bgColor: '#FEF2F2',
    borderColor: '#FECACA',
    step: -1,
    customerMessage:
      'Tu pedido fue cancelado. Si tenés alguna duda, estamos a disposición para ayudarte.',
    actionTip:
      'Podés contactarnos respondiendo este correo o llamando al local.',
  },
};

const C = {
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  bg: '#F5F3F0',
  card: '#FFFFFF',
  text: '#1C1917',
  textMuted: '#57534E',
  textSubtle: '#78716C',
  border: '#E7E5E4',
  borderLight: '#F5F5F4',
  accent: '#0F766E',
  accentDark: '#115E59',
  accentSoft: '#CCFBF1',
  warm: '#B45309',
  warmSoft: '#FFFBEB',
  bentoo: '#0F766E',
};

export function getBentooEmailLogoUrl(): string {
  const explicit = (process.env.BENTOO_EMAIL_LOGO_URL || '').trim();
  if (explicit) return explicit;

  return `${getEmailPublicBaseUrl()}/apple-touch-icon.svg`;
}

function bentooHeaderBranding(): { logoUrl: string; brandName: string } {
  return { logoUrl: getBentooEmailLogoUrl(), brandName: 'Bentoo' };
}

export function formatPrice(amount: number): string {
  return Number(amount).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'Cliente';
}

function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function baseStyles(): string {
  return `
    <style>
      body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
      body {
        font-family: ${C.font};
        background-color: ${C.bg};
        color: ${C.text};
        line-height: 1.65;
      }
      a { color: ${C.accent}; text-decoration: none; }
      a:hover { text-decoration: underline; }
      @media screen and (max-width: 600px) {
        .email-wrapper { padding: 16px !important; }
        .email-content { padding: 28px 22px !important; }
        .email-header { padding: 32px 22px !important; }
        .email-header h1 { font-size: 22px !important; }
        .btn-primary { padding: 14px 24px !important; font-size: 15px !important; display: block !important; text-align: center !important; }
        .order-item-price { text-align: left !important; padding-top: 8px !important; padding-left: 0 !important; }
        .progress-step { width: 50% !important; margin-bottom: 12px !important; }
        .hide-mobile { display: none !important; }
        .footer-col { display: block !important; width: 100% !important; padding: 6px 0 !important; border: none !important; }
      }
    </style>
  `;
}

function emailDocument(title: string, bodyBg: string, inner: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  ${baseStyles()}
</head>
<body style="margin: 0; padding: 0; background-color: ${bodyBg};">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${bodyBg};">
    <tr>
      <td class="email-wrapper" style="padding: 40px 20px;">
        ${inner}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function emailCard(content: string, disclaimer?: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; margin: 0 auto; background: ${C.card}; border-radius: 16px; overflow: hidden; border: 1px solid ${C.border}; box-shadow: 0 4px 24px rgba(28, 25, 23, 0.06);">
  ${content}
</table>
${
  disclaimer
    ? `
<table cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; margin: 20px auto 0;">
  <tr>
    <td style="text-align: center; padding: 0 24px;">
      <p style="margin: 0; font-size: 12px; color: ${C.textSubtle}; line-height: 1.6;">${disclaimer}</p>
    </td>
  </tr>
</table>`
    : ''
}`;
}

function emailBrandLogo(logoUrl: string, brandName: string): string {
  const safeUrl = escapeHtml(logoUrl);
  const safeName = escapeHtml(brandName);
  return `
<div style="margin-bottom: 18px;">
  <img
    src="${safeUrl}"
    alt="${safeName}"
    width="64"
    height="64"
    style="display: inline-block; width: 64px; height: 64px; max-width: 64px; max-height: 64px; object-fit: contain; border-radius: 12px; border: 1px solid ${C.border}; background: ${C.card}; padding: 4px;"
  />
</div>`;
}

function emailHeader(params: {
  eyebrow: string;
  title: string;
  subtitle: string;
  accent: string;
  badge?: string;
  logoUrl?: string | null;
  brandName?: string;
}): string {
  const logoBlock =
    params.logoUrl && params.brandName
      ? emailBrandLogo(params.logoUrl, params.brandName)
      : '';

  return `
<tr>
  <td class="email-header" style="padding: 0;">
    <div style="height: 4px; background: linear-gradient(90deg, ${params.accent}, ${adjustColor(params.accent, 15)});"></div>
    <div style="padding: 40px 40px 32px; text-align: center; background: linear-gradient(180deg, ${adjustColor(params.accent, 90)} 0%, ${C.card} 100%);">
      ${logoBlock}
      <p style="margin: 0 0 10px; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${params.accent};">${params.eyebrow}</p>
      <h1 style="margin: 0 0 10px; font-size: 28px; font-weight: 700; color: ${C.text}; letter-spacing: -0.3px; line-height: 1.25;">${params.title}</h1>
      <p style="margin: 0 0 ${params.badge ? '18px' : '0'}; font-size: 16px; color: ${C.textMuted}; line-height: 1.5;">${params.subtitle}</p>
      ${
        params.badge
          ? `
      <span style="display: inline-block; background: ${C.card}; border: 1px solid ${C.border}; color: ${C.text}; padding: 10px 22px; border-radius: 999px; font-weight: 600; font-size: 14px; letter-spacing: 0.3px;">
        Pedido #${params.badge}
      </span>`
          : ''
      }
    </div>
  </td>
</tr>`;
}

function emailCta(href: string, label: string, accent: string): string {
  return `
<table cellpadding="0" cellspacing="0" width="100%" style="margin-top: 8px;">
  <tr>
    <td style="text-align: center;">
      <a href="${href}" class="btn-primary" style="display: inline-block; background: ${accent}; color: #ffffff; text-decoration: none; padding: 16px 36px; border-radius: 10px; font-weight: 600; font-size: 15px; letter-spacing: 0.2px;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

function emailSecondaryLink(href: string, label: string): string {
  return `
<p style="margin: 16px 0 0; font-size: 13px; color: ${C.textSubtle}; text-align: center; line-height: 1.5;">
  ${label}<br>
  <a href="${href}" style="color: ${C.accent}; word-break: break-all;">${href}</a>
</p>`;
}

function emailParagraph(html: string, muted = false): string {
  return `<p style="margin: 0 0 16px; color: ${muted ? C.textMuted : C.text}; font-size: 16px; line-height: 1.7;">${html}</p>`;
}

export function emailHighlightBox(
  content: string,
  variant: 'neutral' | 'success' | 'warning' | 'danger' = 'neutral',
): string {
  const styles = {
    neutral: { bg: '#FAFAF9', border: C.border, text: C.textMuted },
    success: { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
    danger: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
  }[variant];
  return `
<div style="background: ${styles.bg}; border: 1px solid ${styles.border}; border-radius: 12px; padding: 18px 20px; margin: 20px 0;">
  <p style="margin: 0; color: ${styles.text}; font-size: 15px; line-height: 1.65;">${content}</p>
</div>`;
}

function emailSectionTitle(label: string): string {
  return `
<p style="margin: 0 0 14px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: ${C.textSubtle};">${label}</p>`;
}

function emailFooterRestaurant(restaurant: RestaurantData): string {
  const logoBlock = restaurant.logoUrl
    ? emailBrandLogo(restaurant.logoUrl, restaurant.name)
    : '';

  return `
<tr>
  <td style="background: #FAFAF9; padding: 32px 36px; text-align: center; border-top: 1px solid ${C.border};">
    ${logoBlock}
    <p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${C.text}; letter-spacing: -0.2px;">${restaurant.name}</p>
    <p style="margin: 0 0 20px; font-size: 14px; color: ${C.textMuted}; line-height: 1.6;">
      Gracias por elegirnos. Estamos acá para ayudarte en lo que necesites.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin: 0 auto 16px;">
      <tr>
        <td class="footer-col" style="padding: 0 14px;">
          <a href="https://maps.google.com/?q=${encodeURIComponent(restaurant.address)}" style="color: ${C.textMuted}; text-decoration: none; font-size: 13px;">${restaurant.address}</a>
        </td>
        <td class="footer-col hide-mobile" style="padding: 0 14px; border-left: 1px solid ${C.border};">
          <a href="tel:${restaurant.phone}" style="color: ${C.textMuted}; text-decoration: none; font-size: 13px;">${restaurant.phone}</a>
        </td>
      </tr>
    </table>
    <div style="width: 48px; height: 3px; background: ${C.accent}; margin: 0 auto; border-radius: 2px; opacity: 0.5;"></div>
  </td>
</tr>`;
}

function emailFooterBentoo(): string {
  const logoBlock = emailBrandLogo(getBentooEmailLogoUrl(), 'Bentoo');

  return `
<tr>
  <td style="background: #FAFAF9; padding: 28px 36px; text-align: center; border-top: 1px solid ${C.border};">
    ${logoBlock}
    <p style="margin: 0 0 4px; font-size: 17px; font-weight: 700; color: ${C.text};">Bentoo</p>
    <p style="margin: 0 0 14px; font-size: 13px; color: ${C.textSubtle};">La plataforma pensada para restaurantes que quieren crecer</p>
    <div style="width: 48px; height: 3px; background: ${C.bentoo}; margin: 0 auto 14px; border-radius: 2px; opacity: 0.6;"></div>
    <p style="margin: 0; font-size: 12px; color: ${C.textSubtle};">
      ¿Necesitás ayuda? <a href="mailto:soporte@bentoo.com.ar" style="color: ${C.accent};">soporte@bentoo.com.ar</a>
    </p>
  </td>
</tr>`;
}

function renderOrderItems(
  items: OrderData['items'],
  accent: string,
  variant: 'customer' | 'restaurant' = 'customer',
): string {
  return items
    .map((item) => {
      const qtyStyle =
        variant === 'restaurant'
          ? `background: ${C.warm}; color: #fff;`
          : `background: ${accent}; color: #fff;`;
      return `
      <tr>
        <td style="padding: 14px 0; border-bottom: 1px solid ${C.borderLight};">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="vertical-align: top;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="${qtyStyle} padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: 700; text-align: center; min-width: 24px;">${item.quantity}</td>
                  <td style="padding-left: 12px;">
                    <p style="margin: 0; font-weight: 600; color: ${C.text}; font-size: 15px; line-height: 1.4;">${item.name}</p>
                    ${item.notes ? `<p style="margin: 6px 0 0; font-size: 13px; color: ${C.textMuted}; background: #FAFAF9; padding: 8px 10px; border-radius: 6px; border-left: 3px solid ${accent};">${item.notes}</p>` : ''}
                  </td>
                </tr></table>
              </td>
              <td class="order-item-price" style="text-align: right; font-weight: 600; color: ${C.text}; white-space: nowrap; vertical-align: top; padding-left: 16px; font-size: 15px;">
                $${formatPrice(item.unitPrice * item.quantity)}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join('');
}

function renderProgressSteps(currentStep: number): string {
  const steps = [
    { num: 2, label: 'Pagado' },
    { num: 3, label: 'Confirmado' },
    { num: 4, label: 'Preparando' },
    { num: 5, label: 'Listo' },
  ];

  return steps
    .map((step, index) => {
      const isCompleted = currentStep >= step.num;
      const isActive = currentStep === step.num;
      const isLast = index === steps.length - 1;
      const circleBg = isCompleted ? C.accent : '#E7E5E4';
      const circleColor = isCompleted ? '#fff' : C.textSubtle;
      const labelColor = isActive
        ? C.accent
        : isCompleted
          ? C.textMuted
          : C.textSubtle;
      const labelWeight = isActive || isCompleted ? '600' : '400';
      const lineBg = isCompleted && !isLast ? C.accent : '#E7E5E4';

      return `
      <td class="progress-step" style="width: 25%; text-align: center; vertical-align: top; position: relative; padding: 0 4px;">
        <div style="display: inline-block; width: 36px; height: 36px; border-radius: 50%; background: ${circleBg}; color: ${circleColor}; line-height: 36px; font-size: 13px; font-weight: 700;">
          ${isCompleted ? '✓' : step.num - 1}
        </div>
        <p style="margin: 8px 0 0; font-size: 11px; color: ${labelColor}; font-weight: ${labelWeight};">${step.label}</p>
        ${!isLast ? `<div style="position: absolute; top: 18px; left: 62%; width: 76%; height: 2px; background: ${lineBg}; border-radius: 1px;"></div>` : ''}
      </td>`;
    })
    .join('');
}

function getEstimatedTime(order: OrderData): string | null {
  const totalItems = order.items.reduce((sum, i) => sum + i.quantity, 0);
  let baseMinutes = 15 + totalItems * 3;
  if (order.type === 'DELIVERY') {
    baseMinutes += 20;
    return `Estimado: ${baseMinutes}–${baseMinutes + 15} min`;
  }
  if (order.type === 'PICKUP') {
    return `Listo en ~${baseMinutes} min`;
  }
  return null;
}

function getDeliveryTypeHtml(order: OrderData): string {
  const typeConfig = {
    DELIVERY: {
      title: 'Entrega a domicilio',
      subtitle: 'Te lo llevamos a tu puerta',
      color: '#0369A1',
      bg: '#F0F9FF',
      border: '#BAE6FD',
    },
    PICKUP: {
      title: 'Retiro en local',
      subtitle: 'Pasá a buscarlo cuando esté listo',
      color: '#0F766E',
      bg: '#F0FDFA',
      border: '#99F6E4',
    },
    DINE_IN: {
      title: 'Consumo en local',
      subtitle: 'Te lo llevamos a tu mesa',
      color: '#6D28D9',
      bg: '#F5F3FF',
      border: '#DDD6FE',
    },
  };
  const config =
    typeConfig[order.type as keyof typeof typeConfig] || typeConfig.PICKUP;

  return `
<div style="background: ${config.bg}; border: 1px solid ${config.border}; border-radius: 12px; padding: 18px 20px; margin-top: 8px;">
  <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: ${config.color};">${config.title}</p>
  <p style="margin: 0; font-size: 13px; color: ${C.textMuted};">${config.subtitle}</p>
  ${
    order.type === 'DELIVERY' && order.deliveryAddress
      ? `
  <div style="background: rgba(255,255,255,0.7); border-radius: 8px; padding: 12px 14px; margin-top: 12px;">
    <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: ${C.text};">${order.deliveryAddress}</p>
    ${order.deliveryNotes ? `<p style="margin: 0; font-size: 13px; color: ${C.textMuted};">${order.deliveryNotes}</p>` : ''}
  </div>`
      : ''
  }
</div>`;
}

// ─── Public renderers ─────────────────────────────────────────

export function renderOrderConfirmationEmail(
  order: OrderData,
  restaurant: RestaurantData,
  trackingUrl: string,
): string {
  const orderTime = new Date().toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const orderDate = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const estimatedTime = getEstimatedTime(order);
  const accent = C.accent;

  const content = `
${emailHeader({
  eyebrow: restaurant.name,
  title: 'Tu pedido fue confirmado',
  subtitle: 'Recibimos tu pago y ya estamos organizando todo',
  accent,
  badge: order.orderNumber,
  logoUrl: restaurant.logoUrl,
  brandName: restaurant.name,
})}
<tr>
  <td style="padding: 0 36px;">
    <div style="margin-top: -12px; background: ${C.card}; border: 1px solid ${C.border}; border-radius: 10px; padding: 12px 16px;">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="font-size: 13px; color: ${C.textMuted};">${orderDate} · ${orderTime}</td>
          ${estimatedTime ? `<td style="text-align: right; font-size: 13px; color: ${C.accent}; font-weight: 600;">${estimatedTime}</td>` : ''}
        </tr>
      </table>
    </div>
  </td>
</tr>
<tr>
  <td class="email-content" style="padding: 32px 36px 36px;">
    ${emailParagraph(`Hola <strong>${firstName(order.customerName)}</strong>,`)}
    ${emailParagraph(
      `Gracias por tu pedido en <strong>${restaurant.name}</strong>. Te iremos contando cada avance para que sepas exactamente en qué momento está.`,
      true,
    )}
    <div style="background: #FAFAF9; border: 1px solid ${C.border}; border-radius: 12px; padding: 22px 20px; margin-bottom: 24px;">
      ${emailSectionTitle('Estado de tu pedido')}
      <table cellpadding="0" cellspacing="0" width="100%"><tr>${renderProgressSteps(2)}</tr></table>
    </div>
    <div style="border: 1px solid ${C.border}; border-radius: 12px; overflow: hidden; margin-bottom: 20px;">
      <div style="background: #FAFAF9; padding: 14px 18px; border-bottom: 1px solid ${C.border};">
        ${emailSectionTitle('Detalle del pedido').replace('margin: 0 0 14px', 'margin: 0')}
      </div>
      <div style="padding: 4px 18px 12px;">
        <table cellpadding="0" cellspacing="0" width="100%">${renderOrderItems(order.items, accent)}</table>
      </div>
    </div>
    ${order.notes ? emailHighlightBox(`<strong>Notas del pedido:</strong> ${order.notes}`, 'warning') : ''}
    <div style="background: #FAFAF9; border-radius: 12px; padding: 18px 20px; margin-bottom: 20px;">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="padding: 6px 0; color: ${C.textMuted}; font-size: 14px;">Subtotal</td><td style="text-align: right; color: ${C.text}; font-size: 14px;">$${formatPrice(order.subtotal)}</td></tr>
        ${order.deliveryFee > 0 ? `<tr><td style="padding: 6px 0; color: ${C.textMuted}; font-size: 14px;">Envío</td><td style="text-align: right; color: ${C.text}; font-size: 14px;">$${formatPrice(order.deliveryFee)}</td></tr>` : ''}
        ${order.tip > 0 ? `<tr><td style="padding: 6px 0; color: ${C.textMuted}; font-size: 14px;">Propina</td><td style="text-align: right; color: ${C.text}; font-size: 14px;">$${formatPrice(order.tip)}</td></tr>` : ''}
        <tr><td colspan="2" style="padding-top: 12px; border-top: 1px dashed ${C.border};"></td></tr>
        <tr><td style="padding: 8px 0; color: ${C.text}; font-size: 16px; font-weight: 700;">Total pagado</td><td style="text-align: right; font-size: 22px; font-weight: 700; color: ${accent};">$${formatPrice(order.total)}</td></tr>
      </table>
    </div>
    ${getDeliveryTypeHtml(order)}
    ${emailCta(trackingUrl, 'Seguir mi pedido', accent)}
    ${emailSecondaryLink(trackingUrl, 'También podés abrir este enlace:')}
  </td>
</tr>
${emailFooterRestaurant(restaurant)}`;

  return emailDocument(
    `Pedido confirmado · ${order.orderNumber}`,
    C.bg,
    emailCard(
      content,
      `Este correo fue enviado porque realizaste un pedido en ${restaurant.name}. Si no fuiste vos, contactanos de inmediato.`,
    ),
  );
}

export function renderNewOrderEmail(
  order: OrderData,
  restaurant?: Pick<RestaurantData, 'name' | 'logoUrl'>,
): string {
  const orderTime = new Date().toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const orderDate = new Date().toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const orderTypeConfig = {
    DELIVERY: { label: 'Delivery', color: '#0369A1', bg: '#F0F9FF' },
    PICKUP: { label: 'Retiro', color: '#0F766E', bg: '#F0FDFA' },
    DINE_IN: { label: 'En local', color: '#6D28D9', bg: '#F5F3FF' },
  };
  const typeInfo =
    orderTypeConfig[order.type as keyof typeof orderTypeConfig] ||
    orderTypeConfig.PICKUP;
  const accent = C.warm;

  const content = `
${emailHeader({
  eyebrow: restaurant?.name ?? 'Nuevo pedido',
  title: 'Tenés un pedido nuevo',
  subtitle: `Recibido ${orderDate} a las ${orderTime}`,
  accent,
  badge: order.orderNumber,
  logoUrl: restaurant?.logoUrl,
  brandName: restaurant?.name,
})}
<tr>
  <td style="padding: 0 32px;">
    <div style="margin-top: -12px; background: ${C.warmSoft}; border: 1px solid #FDE68A; border-radius: 10px; padding: 12px 16px; text-align: center;">
      <p style="margin: 0; font-size: 14px; font-weight: 600; color: #92400E;">Pago confirmado — preparar a la brevedad</p>
    </div>
  </td>
</tr>
<tr>
  <td class="email-content" style="padding: 28px 32px 32px;">
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
      <tr>
        <td style="width: 48%; vertical-align: top; padding-right: 8px;">
          <div style="background: #FAFAF9; border: 1px solid ${C.border}; border-radius: 12px; padding: 16px; height: 100%;">
            ${emailSectionTitle('Cliente')}
            <p style="margin: 0 0 8px; font-size: 16px; font-weight: 700; color: ${C.text};">${order.customerName}</p>
            <p style="margin: 0;"><a href="tel:${order.customerPhone}" style="color: ${C.accent}; font-size: 14px; font-weight: 600;">${order.customerPhone}</a></p>
            ${order.customerEmail ? `<p style="margin: 4px 0 0; font-size: 13px; color: ${C.textMuted};">${order.customerEmail}</p>` : ''}
          </div>
        </td>
        <td style="width: 48%; vertical-align: top; padding-left: 8px;">
          <div style="background: ${typeInfo.bg}; border: 1px solid ${typeInfo.color}22; border-radius: 12px; padding: 16px; height: 100%;">
            ${emailSectionTitle(typeInfo.label)}
            ${
              order.type === 'DELIVERY'
                ? `
            <p style="margin: 0 0 6px; font-size: 14px; font-weight: 600; color: ${C.text}; line-height: 1.4;">${order.deliveryAddress}</p>
            ${order.deliveryNotes ? `<p style="margin: 0; font-size: 13px; color: ${C.textMuted};">${order.deliveryNotes}</p>` : ''}`
                : `<p style="margin: 0; font-size: 14px; color: ${C.text};">${order.type === 'PICKUP' ? 'El cliente retira en el local' : 'Servir en mesa'}</p>`
            }
          </div>
        </td>
      </tr>
    </table>
    ${order.notes ? emailHighlightBox(`<strong>Nota del cliente:</strong> ${order.notes}`, 'danger') : ''}
    <div style="border: 1px solid ${C.border}; border-radius: 12px; overflow: hidden; margin-bottom: 20px;">
      <div style="background: ${C.text}; padding: 12px 18px;">
        <p style="margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #fff;">
          Items (${order.items.reduce((s, i) => s + i.quantity, 0)})
        </p>
      </div>
      <div style="padding: 4px 18px 14px;">
        <table cellpadding="0" cellspacing="0" width="100%">${renderOrderItems(order.items, accent, 'restaurant')}</table>
      </div>
    </div>
    <div style="background: ${accent}; border-radius: 12px; padding: 22px; text-align: center;">
      <p style="margin: 0 0 6px; font-size: 12px; color: rgba(255,255,255,0.85); text-transform: uppercase; letter-spacing: 1px;">Total del pedido</p>
      <p style="margin: 0; font-size: 32px; font-weight: 700; color: #fff; letter-spacing: -0.5px;">$${formatPrice(order.total)}</p>
      ${order.tip > 0 ? `<p style="margin: 8px 0 0; font-size: 13px; color: rgba(255,255,255,0.9);">Incluye propina de $${formatPrice(order.tip)}</p>` : ''}
    </div>
  </td>
</tr>
<tr>
  <td style="background: #FAFAF9; padding: 16px 32px; text-align: center; border-top: 1px solid ${C.border};">
    <p style="margin: 0; font-size: 12px; color: ${C.textSubtle};">Notificación automática · ${orderDate} ${orderTime}</p>
  </td>
</tr>`;

  return emailDocument(
    `Nuevo pedido · ${order.orderNumber}`,
    C.bg,
    emailCard(content),
  );
}

export function renderStatusUpdateEmail(
  order: OrderData,
  restaurant: RestaurantData,
  trackingUrl: string,
): string {
  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.PENDING;
  const updateTime = new Date().toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const content = `
${emailHeader({
  eyebrow: restaurant.name,
  title: config.title,
  subtitle: config.subtitle,
  accent: config.color,
  badge: order.orderNumber,
  logoUrl: restaurant.logoUrl,
  brandName: restaurant.name,
})}
<tr>
  <td class="email-content" style="padding: 32px 36px 36px;">
    <p style="margin: 0 0 20px; font-size: 13px; color: ${C.textSubtle}; text-align: center;">Actualizado a las ${updateTime}</p>
    ${
      order.status !== 'CANCELLED'
        ? `
    <div style="background: #FAFAF9; border: 1px solid ${C.border}; border-radius: 12px; padding: 22px 20px; margin-bottom: 24px;">
      ${emailSectionTitle('Progreso de tu pedido')}
      <table cellpadding="0" cellspacing="0" width="100%"><tr>${renderProgressSteps(config.step)}</tr></table>
    </div>`
        : ''
    }
    <div style="background: ${config.bgColor}; border: 1px solid ${config.borderColor}; border-radius: 12px; padding: 20px 22px; margin-bottom: 24px;">
      ${emailParagraph(config.customerMessage)}
      ${emailParagraph(`<em style="font-size: 14px; color: ${C.textMuted};">${config.actionTip}</em>`, true)}
    </div>
    ${
      order.status !== 'CANCELLED' && order.items.length > 0
        ? `
    <div style="border: 1px solid ${C.border}; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
      <div style="background: #FAFAF9; padding: 12px 18px; border-bottom: 1px solid ${C.border};">
        ${emailSectionTitle('Tu pedido').replace('margin: 0 0 14px', 'margin: 0')}
      </div>
      <div style="padding: 4px 18px 12px;">
        <table cellpadding="0" cellspacing="0" width="100%">${renderOrderItems(order.items, config.color)}</table>
      </div>
      <div style="padding: 12px 18px 16px; border-top: 1px dashed ${C.border}; text-align: right;">
        <span style="font-size: 14px; color: ${C.textMuted}; margin-right: 8px;">Total</span>
        <span style="font-size: 20px; font-weight: 700; color: ${config.color};">$${formatPrice(order.total)}</span>
      </div>
    </div>`
        : ''
    }
    <div style="background: #FAFAF9; border: 1px solid ${C.border}; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td>
            <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: ${C.text};">${restaurant.name}</p>
            <p style="margin: 0; font-size: 13px; color: ${C.textMuted};">${restaurant.address}</p>
          </td>
          <td style="text-align: right;">
            <a href="tel:${restaurant.phone}" style="display: inline-block; background: ${C.accent}; color: white; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;">Llamar</a>
          </td>
        </tr>
      </table>
    </div>
    ${emailCta(trackingUrl, 'Ver estado en tiempo real', config.color)}
    ${emailSecondaryLink(trackingUrl, 'O abrí este enlace para seguir tu pedido:')}
  </td>
</tr>
${emailFooterRestaurant(restaurant)}`;

  return emailDocument(
    `${config.title} · ${order.orderNumber}`,
    C.bg,
    emailCard(
      content,
      `Recibís este correo porque tenés un pedido activo en ${restaurant.name}.`,
    ),
  );
}

export function renderSubscriptionEmail(params: {
  title: string;
  subtitle: string;
  content: string;
  ctaText: string;
  ctaUrl: string;
  accent?: string;
  restaurant?: Pick<
    RestaurantData,
    'name' | 'logoUrl' | 'address' | 'phone'
  > & {
    email?: string | null;
  };
}): string {
  const accent = params.accent ?? C.bentoo;
  const isRestaurantBrand = !!params.restaurant;

  const content = `
${emailHeader({
  eyebrow: isRestaurantBrand ? params.restaurant!.name : 'Bentoo',
  title: params.title,
  subtitle: params.subtitle,
  accent,
  logoUrl: isRestaurantBrand
    ? params.restaurant?.logoUrl
    : getBentooEmailLogoUrl(),
  brandName: isRestaurantBrand ? params.restaurant!.name : 'Bentoo',
})}
<tr>
  <td class="email-content" style="padding: 32px 36px 36px;">
    ${params.content}
    ${emailCta(params.ctaUrl, params.ctaText, accent)}
  </td>
</tr>
${
  isRestaurantBrand
    ? emailFooterRestaurant({
        id: '',
        name: params.restaurant!.name,
        email: params.restaurant!.email ?? '',
        phone: params.restaurant!.phone ?? '',
        address: params.restaurant!.address ?? '',
        logoUrl: params.restaurant!.logoUrl,
      })
    : emailFooterBentoo()
}`;

  return emailDocument(params.title, C.bg, emailCard(content));
}

export function renderNotificationEmail(
  title: string,
  message: string,
  data?: unknown,
): string {
  const content = `
${emailHeader({
  eyebrow: 'Notificación',
  title,
  subtitle: 'Mensaje del sistema de gestión',
  accent: C.accent,
  ...bentooHeaderBranding(),
})}
<tr>
  <td class="email-content" style="padding: 32px 36px 36px;">
    ${emailParagraph(message)}
    ${
      data
        ? emailHighlightBox(
            `<strong>Detalles:</strong><pre style="margin: 8px 0 0; font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word;">${JSON.stringify(data, null, 2)}</pre>`,
            'neutral',
          )
        : ''
    }
  </td>
</tr>
${emailFooterBentoo()}`;

  return emailDocument(title, C.bg, emailCard(content));
}

export function subscriptionContentParagraph(
  text: string,
  muted = false,
): string {
  return emailParagraph(text, muted);
}

export function subscriptionDataTable(rows: Array<[string, string]>): string {
  const rowsHtml = rows
    .map(
      ([label, value]) => `
    <tr>
      <td style="padding: 8px 0; color: ${C.textMuted}; font-size: 14px; border-bottom: 1px solid ${C.border};">${label}</td>
      <td style="padding: 8px 0; color: ${C.text}; font-size: 14px; text-align: right; font-weight: 600; border-bottom: 1px solid ${C.border};">${value}</td>
    </tr>`,
    )
    .join('');
  return `
<div style="background: #FAFAF9; border: 1px solid ${C.border}; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
  <table style="width: 100%; border-collapse: collapse;">${rowsHtml}</table>
</div>`;
}

export function subscriptionPlanChangeBox(
  oldPlan: string,
  newPlan: string,
): string {
  return `
<div style="background: linear-gradient(135deg, ${C.accentDark} 0%, ${C.accent} 100%); border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center;">
  <p style="margin: 0 0 6px; color: rgba(255,255,255,0.75); font-size: 13px;">${oldPlan}</p>
  <p style="margin: 0 0 6px; color: rgba(255,255,255,0.5); font-size: 18px;">↓</p>
  <p style="margin: 0; color: #fff; font-size: 20px; font-weight: 700;">${newPlan}</p>
</div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderMagicLinkEmail(params: {
  name: string;
  link: string;
  expiresInMinutes: number;
}): string {
  const safeName = escapeHtml(params.name || 'Hola');
  const safeLink = escapeHtml(params.link);

  const content = `
${emailHeader({
  eyebrow: 'Bentoo',
  title: 'Entrá a tu panel',
  subtitle: 'Acceso seguro sin contraseña',
  accent: C.bentoo,
  ...bentooHeaderBranding(),
})}
<tr>
  <td class="email-content" style="padding: 32px 36px 36px;">
    ${emailParagraph(`Hola <strong>${safeName}</strong>,`)}
    ${emailParagraph(
      `Recibimos una solicitud para ingresar a tu panel de Bentoo. Este enlace es de un solo uso y vence en <strong>${params.expiresInMinutes} minutos</strong>.`,
      true,
    )}
    ${emailCta(params.link, 'Entrar al panel', C.accent)}
    ${emailSecondaryLink(safeLink, 'Si el botón no funciona, copiá este enlace:')}
    ${emailHighlightBox(
      'Si no pediste este acceso, podés ignorar este correo. Tu cuenta sigue protegida.',
      'neutral',
    )}
  </td>
</tr>
${emailFooterBentoo()}`;

  return emailDocument('Acceso a Bentoo', C.bg, emailCard(content));
}

export function renderEmailVerificationEmail(params: {
  name: string;
  link: string;
  expiresInHours: number;
}): string {
  const safeName = escapeHtml(params.name || 'Hola');
  const safeLink = escapeHtml(params.link);

  const content = `
${emailHeader({
  eyebrow: 'Bentoo',
  title: 'Confirmá tu email',
  subtitle: 'Un paso más para publicar tu restaurante',
  accent: C.bentoo,
  ...bentooHeaderBranding(),
})}
<tr>
  <td class="email-content" style="padding: 32px 36px 36px;">
    ${emailParagraph(`Hola <strong>${safeName}</strong>,`)}
    ${emailParagraph(
      `Para crear y publicar tu restaurante en Bentoo necesitamos confirmar que este email es tuyo. El enlace vence en <strong>${params.expiresInHours} horas</strong>.`,
      true,
    )}
    ${emailCta(params.link, 'Confirmar email', C.accent)}
    ${emailSecondaryLink(safeLink, 'Si el botón no funciona, copiá este enlace:')}
    ${emailHighlightBox(
      'Si no creaste una cuenta en Bentoo, podés ignorar este correo.',
      'neutral',
    )}
  </td>
</tr>
${emailFooterBentoo()}`;

  return emailDocument('Confirmá tu email en Bentoo', C.bg, emailCard(content));
}

export function renderPasswordResetEmail(params: {
  name: string;
  link: string;
  expiresInMinutes: number;
}): string {
  const safeName = escapeHtml(params.name || 'Hola');
  const safeLink = escapeHtml(params.link);

  const content = `
${emailHeader({
  eyebrow: 'Bentoo',
  title: 'Restablecé tu contraseña',
  subtitle: 'Recuperá el acceso a tu panel',
  accent: C.bentoo,
  ...bentooHeaderBranding(),
})}
<tr>
  <td class="email-content" style="padding: 32px 36px 36px;">
    ${emailParagraph(`Hola <strong>${safeName}</strong>,`)}
    ${emailParagraph(
      `Recibimos una solicitud para restablecer la contraseña de tu cuenta. Este enlace es de un solo uso y vence en <strong>${params.expiresInMinutes} minutos</strong>.`,
      true,
    )}
    ${emailCta(params.link, 'Elegir nueva contraseña', C.accent)}
    ${emailSecondaryLink(safeLink, 'Si el botón no funciona, copiá este enlace:')}
    ${emailHighlightBox(
      'Si no pediste restablecer tu contraseña, podés ignorar este correo. Tu cuenta sigue protegida.',
      'neutral',
    )}
  </td>
</tr>
${emailFooterBentoo()}`;

  return emailDocument('Restablecer contraseña', C.bg, emailCard(content));
}

export function renderCustomerMagicLinkEmail(params: {
  restaurantName: string;
  customerName: string;
  link: string;
  expiresInMinutes: number;
  logoUrl?: string | null;
}): string {
  const safeName = escapeHtml(params.customerName || 'Cliente');
  const safeRestaurant = escapeHtml(params.restaurantName || 'Bentoo');
  const safeLink = escapeHtml(params.link);

  const content = `
${emailHeader({
  eyebrow: safeRestaurant,
  title: safeRestaurant,
  subtitle: `Hola ${safeName}, te enviamos un acceso seguro`,
  accent: C.accent,
  logoUrl: params.logoUrl,
  brandName: params.restaurantName,
})}
<tr>
  <td class="email-content" style="padding: 32px 36px 36px;">
    ${emailParagraph(
      `Usá el botón de abajo para entrar a tu cuenta sin contraseña. El enlace vence en <strong>${params.expiresInMinutes} minutos</strong> y solo funciona una vez.`,
      true,
    )}
    ${emailCta(params.link, 'Entrar a mi cuenta', C.accent)}
    ${emailSecondaryLink(safeLink, 'También podés abrir este enlace:')}
    ${emailHighlightBox(
      'Si no pediste este acceso, ignorá este correo. Tu historial y datos siguen protegidos.',
      'neutral',
    )}
  </td>
</tr>
<tr>
  <td style="background: #FAFAF9; padding: 24px 36px; text-align: center; border-top: 1px solid ${C.border};">
    <p style="margin: 0; font-size: 14px; font-weight: 600; color: ${C.text};">${safeRestaurant}</p>
    <p style="margin: 6px 0 0; font-size: 13px; color: ${C.textSubtle};">Gracias por elegirnos</p>
  </td>
</tr>`;

  return emailDocument(`Acceso · ${safeRestaurant}`, C.bg, emailCard(content));
}

export function renderActivationCodeEmail(params: {
  name: string;
  restaurantName: string;
  formattedCode: string;
  expiresAt: string;
}): string {
  const safeName = escapeHtml(params.name);
  const safeRestaurant = escapeHtml(params.restaurantName);

  const content = `
${emailHeader({
  eyebrow: 'Invitación al equipo',
  title: 'Tu acceso al panel',
  subtitle: safeRestaurant,
  accent: C.bentoo,
  ...bentooHeaderBranding(),
})}
<tr>
  <td class="email-content" style="padding: 32px 36px 36px;">
    ${emailParagraph(`Hola <strong>${safeName}</strong>,`)}
    ${emailParagraph(
      `Te dieron acceso al panel de <strong>${safeRestaurant}</strong>. Usá este código en tu primer ingreso para crear tu contraseña:`,
      true,
    )}
    <div style="text-align: center; margin: 24px 0;">
      <span style="display: inline-block; font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 18px 28px; background: #FAFAF9; border: 1px solid ${C.border}; border-radius: 12px; color: ${C.text}; font-family: monospace;">
        ${params.formattedCode}
      </span>
    </div>
    ${emailParagraph(
      `El código vence el <strong>${params.expiresAt}</strong> y solo puede usarse una vez.`,
      true,
    )}
    ${emailHighlightBox(
      'Si no esperabas este acceso, podés ignorar este correo.',
      'neutral',
    )}
  </td>
</tr>
${emailFooterBentoo()}`;

  return emailDocument(
    `Código de activación · ${safeRestaurant}`,
    C.bg,
    emailCard(content),
  );
}

export function renderDigestEmail(params: {
  title: string;
  periodLabel: string;
  totalSales: number;
  totalOrders: number;
  avgTicket: number;
  topDishes: Array<{ name: string; orders: number; revenue: number }>;
  breakdown: Array<{ type: string; orders: number; revenue: number }>;
  logoUrl?: string | null;
  restaurantName?: string;
}): string {
  const topDishesHtml =
    params.topDishes.length > 0
      ? `
    ${emailSectionTitle('Platos más vendidos')}
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
      <tr style="color: ${C.textSubtle}; text-align: left;">
        <th style="padding: 8px 0; font-weight: 600;">Plato</th>
        <th style="padding: 8px 0; text-align: right; font-weight: 600;">Pedidos</th>
        <th style="padding: 8px 0; text-align: right; font-weight: 600;">Ingresos</th>
      </tr>
      ${params.topDishes
        .map(
          (dish, index) => `
      <tr style="border-top: 1px solid ${C.borderLight};">
        <td style="padding: 10px 0; color: ${C.text};">${index + 1}. ${escapeHtml(dish.name)}</td>
        <td style="padding: 10px 0; text-align: right; color: ${C.textMuted};">${dish.orders}</td>
        <td style="padding: 10px 0; text-align: right; color: ${C.text}; font-weight: 600;">$${dish.revenue.toLocaleString('es-AR')}</td>
      </tr>`,
        )
        .join('')}
    </table>`
      : '';

  const breakdownHtml =
    params.breakdown.length > 0
      ? `
    ${emailSectionTitle('Desglose por tipo de pedido')}
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      ${params.breakdown
        .map(
          (row) => `
      <tr style="border-top: 1px solid ${C.borderLight};">
        <td style="padding: 10px 0; color: ${C.text};">${escapeHtml(row.type)}</td>
        <td style="padding: 10px 0; text-align: right; color: ${C.textMuted};">${row.orders} pedidos</td>
        <td style="padding: 10px 0; text-align: right; color: ${C.text}; font-weight: 600;">$${row.revenue.toLocaleString('es-AR')}</td>
      </tr>`,
        )
        .join('')}
    </table>`
      : '';

  const content = `
${emailHeader({
  eyebrow: params.restaurantName ?? 'Resumen del negocio',
  title: params.title,
  subtitle: params.periodLabel,
  accent: C.accent,
  logoUrl: params.logoUrl,
  brandName: params.restaurantName,
})}
<tr>
  <td class="email-content" style="padding: 32px 36px 36px;">
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 28px;">
      <tr>
        <td style="width: 33%; text-align: center; padding: 12px 8px; background: #FAFAF9; border-radius: 10px;">
          <p style="margin: 0; font-size: 22px; font-weight: 700; color: ${C.text};">$${params.totalSales.toLocaleString('es-AR')}</p>
          <p style="margin: 4px 0 0; font-size: 12px; color: ${C.textSubtle};">Ventas</p>
        </td>
        <td style="width: 33%; text-align: center; padding: 12px 8px;">
          <p style="margin: 0; font-size: 22px; font-weight: 700; color: ${C.text};">${params.totalOrders}</p>
          <p style="margin: 4px 0 0; font-size: 12px; color: ${C.textSubtle};">Pedidos</p>
        </td>
        <td style="width: 33%; text-align: center; padding: 12px 8px; background: #FAFAF9; border-radius: 10px;">
          <p style="margin: 0; font-size: 22px; font-weight: 700; color: ${C.text};">$${params.avgTicket.toLocaleString('es-AR')}</p>
          <p style="margin: 4px 0 0; font-size: 12px; color: ${C.textSubtle};">Ticket prom.</p>
        </td>
      </tr>
    </table>
    ${topDishesHtml}
    ${breakdownHtml}
    ${emailParagraph(
      'Este resumen te ayuda a tomar mejores decisiones para tu local. ¡Gracias por confiar en Bentoo!',
      true,
    )}
  </td>
</tr>
${emailFooterBentoo()}`;

  return emailDocument(params.title, C.bg, emailCard(content));
}
