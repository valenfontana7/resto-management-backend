import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OrdersController } from './orders.controller';

describe('permiso puntual de cambio de estado de pedidos', () => {
  const updateStatusMethod = Object.getOwnPropertyDescriptor(
    OrdersController.prototype,
    'updateStatus',
  )?.value as ((this: void, ...args: never[]) => unknown) | undefined;

  if (!updateStatusMethod) {
    throw new Error('OrdersController.updateStatus no está definido');
  }

  const requiredPermissions = Reflect.getMetadata(
    PERMISSIONS_KEY,
    updateStatusMethod,
  ) as string[] | undefined;

  it('protege updateStatus con permisos de pedidos o cocina', () => {
    expect(requiredPermissions).toEqual(['orders', 'kitchen']);
  });

  it.each([
    ['KITCHEN', ['kitchen'], true],
    ['MANAGER', ['orders', 'kitchen'], true],
    ['OWNER', ['all'], true],
    ['DELIVERY', ['delivery'], false],
  ])(
    'aplica la matriz mínima al rol %s',
    async (roleName, permissions, allowed) => {
      const reflector = new Reflector();
      const prisma = {
        role: {
          findUnique: jest.fn().mockResolvedValue({
            name: roleName,
            permissions,
          }),
        },
      };
      const guard = new PermissionsGuard(reflector, prisma as never);
      const context = {
        getHandler: () => updateStatusMethod,
        getClass: () => OrdersController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              userId: 'user-1',
              role: roleName,
              roleId: `role-${roleName}`,
            },
          }),
        }),
      };

      if (allowed) {
        await expect(guard.canActivate(context as never)).resolves.toBe(true);
      } else {
        await expect(guard.canActivate(context as never)).rejects.toThrow(
          /permission/i,
        );
      }
    },
  );
});
