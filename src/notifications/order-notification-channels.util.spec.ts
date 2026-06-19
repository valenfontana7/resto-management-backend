import { NotificationChannel } from '@prisma/client';
import { resolveOrderNotificationChannels } from './order-notification-channels.util';

describe('order-notification-channels.util', () => {
  it('sends email only for new orders and cancellations', () => {
    expect(resolveOrderNotificationChannels('ORDER_CREATED')).toContain(
      NotificationChannel.EMAIL,
    );
    expect(resolveOrderNotificationChannels('ORDER_CANCELLED')).toContain(
      NotificationChannel.EMAIL,
    );
    expect(resolveOrderNotificationChannels('ORDER_UPDATED')).not.toContain(
      NotificationChannel.EMAIL,
    );
    expect(resolveOrderNotificationChannels('ORDER_READY')).not.toContain(
      NotificationChannel.EMAIL,
    );
  });

  it('always includes in-app and push', () => {
    for (const type of [
      'ORDER_CREATED',
      'ORDER_UPDATED',
      'ORDER_READY',
      'ORDER_CANCELLED',
    ] as const) {
      expect(resolveOrderNotificationChannels(type)).toEqual(
        expect.arrayContaining([
          NotificationChannel.IN_APP,
          NotificationChannel.PUSH,
        ]),
      );
    }
  });
});
