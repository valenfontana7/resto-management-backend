import { LeadStatus } from '@prisma/client';
import { LeadDemoViewService } from './lead-demo-view.service';
import { CommercialReactiveSensingHandler } from '../commercial-intelligence/events/commercial-reactive-sensing.handler';

describe('LeadDemoViewService', () => {
  const prisma = {
    demoExample: { findUnique: jest.fn() },
    lead: { findUnique: jest.fn(), update: jest.fn() },
  };

  const onDemoViewed = jest.fn();
  const reactiveSensing = {
    onDemoViewed,
  } as unknown as CommercialReactiveSensingHandler;

  const service = new LeadDemoViewService(prisma as never, reactiveSensing);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records a view when demo example links to a lead', async () => {
    prisma.demoExample.findUnique.mockResolvedValue({
      payload: { leadId: 'lead-1' },
    });
    prisma.lead.findUnique.mockResolvedValue({
      id: 'lead-1',
      businessName: 'Arena Café',
      status: LeadStatus.CONTACTED,
      demoFirstViewedAt: null,
      demoViewCount: 0,
    });
    prisma.lead.update.mockResolvedValue({
      id: 'lead-1',
      businessName: 'Arena Café',
      demoViewCount: 1,
      demoLastViewedAt: new Date('2026-07-03T02:00:00.000Z'),
    });

    const result = await service.recordView('arena-cafe');

    expect(result).toEqual({ recorded: true, leadId: 'lead-1' });
    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          demoViewCount: { increment: 1 },
        }),
      }),
    );
    expect(onDemoViewed).toHaveBeenCalled();
  });

  it('ignores static demos without leadId', async () => {
    prisma.demoExample.findUnique.mockResolvedValue({
      payload: { templateSlug: 'pizza-artesanal' },
    });

    const result = await service.recordView('pizza-artesanal');

    expect(result).toEqual({ recorded: false });
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});
