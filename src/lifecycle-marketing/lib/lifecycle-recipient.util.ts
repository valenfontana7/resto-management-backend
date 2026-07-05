import type { LifecyclePersonalizationContext } from '../types/template.types';

export function resolveLifecycleRecipient(
  channel: string,
  ctx: LifecyclePersonalizationContext,
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
