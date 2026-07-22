import { Injectable } from '@nestjs/common';
import { LabHttpTransport } from '../http/lab-http.transport';

export interface FiscalParticipantContext {
  runId: string;
  restaurantId: string;
  jwt: string;
  simulatedNow: Date;
  correlationId: string;
}

export interface FiscalIssueResponse {
  id?: string;
  cae?: string;
  status?: string;
  fiscalDocument?: {
    id?: string;
    cae?: string;
    status?: string;
  };
}

@Injectable()
export class FiscalParticipant {
  constructor(private readonly http: LabHttpTransport) {}

  async issueForOrder(
    ctx: FiscalParticipantContext,
    input: {
      orderId: string;
      type?: 'FACTURA_B';
      customerName?: string;
      customerDocType?: string;
      customerDocNumber?: string;
    },
  ): Promise<FiscalIssueResponse> {
    return this.http.request<FiscalIssueResponse>({
      path: `/api/restaurants/${ctx.restaurantId}/floor/fiscal/orders/${input.orderId}/issue`,
      method: 'POST',
      jwt: ctx.jwt,
      runId: ctx.runId,
      participantKey: 'manager',
      origin: 'SIMULATED',
      simulatedNow: ctx.simulatedNow,
      correlationId: ctx.correlationId,
      body: {
        type: input.type ?? 'FACTURA_B',
        customerName: input.customerName ?? 'Consumidor Final Lab',
        customerDocType: input.customerDocType ?? 'DNI',
        customerDocNumber: input.customerDocNumber ?? '30111222',
      },
    });
  }
}
