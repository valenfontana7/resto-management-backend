import type { EngagementPersonalizationContext } from '../types/engagement.types';

export function resolveEngagementRecipient(
  channel: string,
  ctx: EngagementPersonalizationContext,
): string | null {
  switch (channel) {
    case 'email':
      return ctx.ownerEmail;
    case 'whatsapp':
      return ctx.ownerPhone;
    case 'in_app':
    case 'cs_task':
      return ctx.ownerUserId;
    default:
      return ctx.ownerEmail;
  }
}
