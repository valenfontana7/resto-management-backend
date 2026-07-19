import { LabHttpTransport } from './lab-http.transport';

describe('LabHttpTransport', () => {
  it('solo permite loopback y propaga el contexto determinístico', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ order: { id: 'order-1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const transport = new LabHttpTransport({
      BENTOO_LAB_INTERNAL_TOKEN: 'internal-lab-token-1234',
    });
    transport.configure(4100);

    await transport.request({
      path: '/api/restaurants/restaurant-1/orders',
      method: 'POST',
      jwt: 'jwt-token',
      runId: 'run-1',
      participantKey: 'client',
      origin: 'SIMULATED',
      simulatedNow: new Date('2026-07-17T23:02:00.000Z'),
      correlationId: 'corr-1',
      body: { items: [] },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4100/api/restaurants/restaurant-1/orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer jwt-token',
          'x-bentoo-lab-run': 'run-1',
          'x-bentoo-lab-participant': 'client',
          'x-bentoo-lab-internal-token': 'internal-lab-token-1234',
          'x-correlation-id': 'corr-1',
        }),
      }),
    );
    fetchMock.mockRestore();
  });

  it('rechaza URLs absolutas', async () => {
    const transport = new LabHttpTransport({
      BENTOO_LAB_INTERNAL_TOKEN: 'internal-lab-token-1234',
    });
    transport.configure(4100);

    await expect(
      transport.request({
        path: 'https://example.com/escape',
        method: 'GET',
        runId: 'run-1',
        participantKey: 'client',
        origin: 'SIMULATED',
        simulatedNow: new Date(),
        correlationId: 'corr-1',
      }),
    ).rejects.toThrow(/relativa/i);
  });
});
