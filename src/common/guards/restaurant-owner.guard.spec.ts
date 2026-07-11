import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RestaurantOwnerGuard } from './restaurant-owner.guard';

describe('RestaurantOwnerGuard', () => {
  const reflector = new Reflector();
  const guard = new RestaurantOwnerGuard(reflector);

  function mockContext(
    params: Record<string, string>,
    user: Record<string, unknown>,
  ) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          params,
          user,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;
  }

  it('allows SUPER_ADMIN cross-tenant access', () => {
    expect(
      guard.canActivate(
        mockContext(
          { id: 'restaurant-b' },
          { restaurantId: 'restaurant-a', role: 'SUPER_ADMIN' },
        ),
      ),
    ).toBe(true);
  });

  it('denies foreign tenant for normal user', () => {
    expect(() =>
      guard.canActivate(
        mockContext(
          { id: 'restaurant-b' },
          { restaurantId: 'restaurant-a', role: 'OWNER' },
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows own tenant', () => {
    expect(
      guard.canActivate(
        mockContext(
          { id: 'restaurant-a' },
          { restaurantId: 'restaurant-a', role: 'OWNER' },
        ),
      ),
    ).toBe(true);
  });

  it('skips guard on @Public() routes', () => {
    const publicReflector = {
      get: () => undefined,
      getAllAndOverride: (key: string) =>
        key === 'isPublic' ? true : undefined,
    } as unknown as Reflector;
    const publicGuard = new RestaurantOwnerGuard(publicReflector);

    expect(
      publicGuard.canActivate(
        mockContext(
          { restaurantId: 'restaurant-b' },
          { restaurantId: 'restaurant-a', role: 'OWNER' },
        ),
      ),
    ).toBe(true);
  });
});
