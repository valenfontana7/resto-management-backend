import { ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { normalizeRoleCode } from '../common/utils/role.utils';

type AccessUser = {
  role?: string | null;
  impersonatedBy?: string | null;
};

type AccessSubscription = {
  status: SubscriptionStatus;
} | null;

/**
 * Pure gate for compose-home AI: ACTIVE paid subscription or SUPER_ADMIN.
 */
export function assertComposeHomeAccessOrThrow(
  user: AccessUser,
  subscription: AccessSubscription,
): void {
  if (
    normalizeRoleCode(user.role) === 'SUPER_ADMIN' ||
    Boolean(user.impersonatedBy)
  ) {
    return;
  }

  if (subscription?.status === SubscriptionStatus.ACTIVE) {
    return;
  }

  throw new ForbiddenException({
    code: 'BUILDER_AI_COMPOSE_REQUIRES_PAID',
    message:
      'Armar con IA está disponible cuando tu suscripción está activa (ya pagaste). Suscribite o pedile acceso a un admin.',
    status: subscription?.status ?? null,
  });
}
