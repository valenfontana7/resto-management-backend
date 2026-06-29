import { BusinessEventMonitorService } from './business-event-monitor.service';
import { BusinessEventPublisherService } from './business-event-publisher.service';
import { PrismaService } from '../prisma/prisma.service';
import { BentooBusinessEventType } from './types/event-type.enum';
import { OrderStatus } from '@prisma/client';

describe('BusinessEventMonitorService', () => {
  const publishDeduped = jest.fn().mockResolvedValue(undefined);
  const publisher = {
    publishDeduped,
  } as unknown as BusinessEventPublisherService;

  const prisma = {
    order: { findMany: jest.fn() },
    restaurant: { findMany: jest.fn() },
    dailyOperation: { findUnique: jest.fn() },
    restaurantCustomerProfile: { findMany: jest.fn() },
    builderConfig: { findUnique: jest.fn() },
    reservation: { findMany: jest.fn() },
  } as unknown as PrismaService;

  const service = new BusinessEventMonitorService(prisma, publisher);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('scanInactiveCustomers', () => {
    it('publishes CustomerInactive for stale profiles', async () => {
      const lastOrderAt = new Date();
      lastOrderAt.setDate(lastOrderAt.getDate() - 45);

      (prisma.order.findMany as jest.Mock).mockResolvedValue([]);
      (
        prisma.restaurantCustomerProfile.findMany as jest.Mock
      ).mockResolvedValue([
        {
          id: 'profile-1',
          restaurantId: 'rest-1',
          displayName: 'Ana',
          orders: [{ createdAt: lastOrderAt }],
        },
      ]);

      await (service as any).scanInactiveCustomers();

      expect(publishDeduped).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: BentooBusinessEventType.CustomerInactive,
          restaurantId: 'rest-1',
          correlationId: 'profile-1',
          payload: expect.objectContaining({
            customerProfileId: 'profile-1',
            customerName: 'Ana',
          }),
        }),
        7 * 24 * 60,
      );
    });
  });

  describe('scanUnpublishedSites', () => {
    it('publishes MarketingSkipped for restaurants never published', async () => {
      (prisma.restaurant.findMany as jest.Mock).mockResolvedValue([
        { id: 'rest-1', name: 'La Nonna' },
      ]);
      (prisma.builderConfig.findUnique as jest.Mock).mockResolvedValue({
        isPublished: false,
        config: { metadata: {} },
      });

      await (service as any).scanUnpublishedSites();

      expect(publishDeduped).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: BentooBusinessEventType.MarketingSkipped,
          restaurantId: 'rest-1',
          payload: { reason: 'site-not-published' },
        }),
        7 * 24 * 60,
      );
    });

    it('skips restaurants that were published before', async () => {
      (prisma.restaurant.findMany as jest.Mock).mockResolvedValue([
        { id: 'rest-1', name: 'La Nonna' },
      ]);
      (prisma.builderConfig.findUnique as jest.Mock).mockResolvedValue({
        isPublished: false,
        config: { metadata: { firstPublishedAt: '2026-01-01T00:00:00.000Z' } },
      });

      await (service as any).scanUnpublishedSites();

      expect(publishDeduped).not.toHaveBeenCalled();
    });
  });

  describe('scanDelayedOrders', () => {
    it('publishes OrderDelayed for stuck orders', async () => {
      const createdAt = new Date(Date.now() - 30 * 60_000);

      (prisma.order.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'ord-1',
          orderNumber: '1042',
          status: OrderStatus.PREPARING,
          restaurantId: 'rest-1',
          createdAt,
        },
      ]);

      await (service as any).scanDelayedOrders();

      expect(publishDeduped).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: BentooBusinessEventType.OrderDelayed,
          correlationId: 'ord-1',
        }),
        30,
      );
    });
  });

  describe('scanPendingReservations', () => {
    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('publishes ReservationPendingConfirmation for today pending within window', async () => {
      const dateKey = '2026-06-28';
      const serviceAt = new Date(`${dateKey}T20:00:00`);
      const now = new Date(serviceAt.getTime() - 2 * 3_600_000);

      jest.useFakeTimers({ now });
      jest
        .spyOn(service as any, 'currentBusinessDate')
        .mockReturnValue(new Date(`${dateKey}T12:00:00.000Z`));

      (prisma.reservation.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'res-1',
          restaurantId: 'rest-1',
          customerName: 'Ana',
          date: new Date(`${dateKey}T12:00:00.000Z`),
          time: '20:00',
          partySize: 4,
        },
      ]);

      await (service as any).scanPendingReservations();

      expect(publishDeduped).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: BentooBusinessEventType.ReservationPendingConfirmation,
          restaurantId: 'rest-1',
          correlationId: 'res-1',
          payload: expect.objectContaining({
            customerName: 'Ana',
            hoursUntilService: 2,
          }),
        }),
        6 * 60,
      );
    });

    it('skips reservations outside confirmation window', async () => {
      const dateKey = '2026-06-28';
      const serviceAt = new Date(`${dateKey}T20:00:00`);
      const now = new Date(serviceAt.getTime() - 5 * 3_600_000);

      jest.useFakeTimers({ now });
      jest
        .spyOn(service as any, 'currentBusinessDate')
        .mockReturnValue(new Date(`${dateKey}T12:00:00.000Z`));

      (prisma.reservation.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'res-1',
          restaurantId: 'rest-1',
          customerName: 'Ana',
          date: new Date(`${dateKey}T12:00:00.000Z`),
          time: '20:00',
          partySize: 4,
        },
      ]);

      await (service as any).scanPendingReservations();

      expect(publishDeduped).not.toHaveBeenCalled();
    });
  });
});
