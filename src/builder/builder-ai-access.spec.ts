import { ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { assertComposeHomeAccessOrThrow } from './builder-ai-access';

describe('assertComposeHomeAccessOrThrow', () => {
  it('allows SUPER_ADMIN without subscription', () => {
    expect(() =>
      assertComposeHomeAccessOrThrow({ role: 'SUPER_ADMIN' }, null),
    ).not.toThrow();
  });

  it('allows impersonated founder support session', () => {
    expect(() =>
      assertComposeHomeAccessOrThrow(
        { role: 'OWNER', impersonatedBy: 'admin-1' },
        null,
      ),
    ).not.toThrow();
  });

  it('allows ACTIVE subscription', () => {
    expect(() =>
      assertComposeHomeAccessOrThrow(
        { role: 'OWNER' },
        { status: SubscriptionStatus.ACTIVE },
      ),
    ).not.toThrow();
  });

  it('blocks trialing owners', () => {
    expect(() =>
      assertComposeHomeAccessOrThrow(
        { role: 'OWNER' },
        { status: SubscriptionStatus.TRIALING },
      ),
    ).toThrow(ForbiddenException);
  });

  it('blocks missing subscription', () => {
    expect(() =>
      assertComposeHomeAccessOrThrow({ role: 'OWNER' }, null),
    ).toThrow(ForbiddenException);
  });
});
