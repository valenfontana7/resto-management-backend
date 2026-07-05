import {
  renderSubscriptionEmail,
  subscriptionContentParagraph,
} from '../../email/email-templates';

export function renderEngagementEmailHtml(params: {
  subject: string;
  bodyPlain: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  restaurantName?: string;
}): string {
  const paragraphs = params.bodyPlain
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) =>
      subscriptionContentParagraph(block.trim().replace(/\n/g, '<br/>'), true),
    )
    .join('');

  return renderSubscriptionEmail({
    title: params.subject,
    subtitle: params.restaurantName
      ? `Para ${params.restaurantName}`
      : 'Bentoo Customer Success',
    content: paragraphs,
    ctaText: params.ctaLabel ?? 'Ir al panel',
    ctaUrl: params.ctaUrl ?? 'https://bentoo.com.ar/admin',
  });
}
