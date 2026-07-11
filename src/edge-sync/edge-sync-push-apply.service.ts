import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { TableSessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FloorIdempotencyService } from '../floor/services/floor-idempotency.service';
import { TableSessionService } from '../floor/services/table-session.service';
import type { EdgeSyncMutationDto } from './dto/edge-sync.dto';
import {
  AddSessionItemsDto,
  CloseTableSessionDto,
  OpenTableSessionDto,
  SendToKitchenDto,
  SessionPaymentMethod,
  VoidTableSessionDto,
} from '../floor/dto/table-session.dto';

type ApplyResult =
  | { ok: true; result?: unknown }
  | { ok: false; reason: string };

@Injectable()
export class EdgeSyncPushApplyService {
  private readonly logger = new Logger(EdgeSyncPushApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TableSessionService))
    private readonly tableSessions: TableSessionService,
    @Inject(forwardRef(() => FloorIdempotencyService))
    private readonly idempotency: FloorIdempotencyService,
  ) {}

  async applyMutation(
    restaurantId: string,
    mutation: EdgeSyncMutationDto,
  ): Promise<ApplyResult> {
    const clientMutationId = mutation.clientMutationId?.trim();
    if (!clientMutationId) {
      return { ok: false, reason: 'missing_clientMutationId' };
    }

    const entityType = this.normalizeEntityType(mutation.entityType);
    const payload = mutation.payload ?? {};

    try {
      const userId = await this.resolveActorUserId(restaurantId, payload);
      const body = this.extractBody(payload);

      switch (entityType) {
        case 'OPEN_SESSION':
          return await this.applyOpen(
            restaurantId,
            userId,
            clientMutationId,
            body,
          );
        case 'ADD_ITEMS':
          return await this.applyAddItems(
            restaurantId,
            userId,
            clientMutationId,
            payload,
            body,
          );
        case 'SEND_KITCHEN':
          return await this.applySendKitchen(
            restaurantId,
            userId,
            clientMutationId,
            payload,
            body,
          );
        case 'CLOSE_SESSION':
        case 'TABLE_SESSION.CLOSE':
          return await this.applyClose(
            restaurantId,
            userId,
            clientMutationId,
            payload,
            body,
          );
        case 'VOID_SESSION':
          return await this.applyVoid(
            restaurantId,
            userId,
            clientMutationId,
            payload,
            body,
          );
        default:
          return { ok: false, reason: `unsupported_entity_type:${entityType}` };
      }
    } catch (error) {
      const reason = this.errorReason(error);
      this.logger.debug(
        `Edge mutation rejected (${entityType}) for ${restaurantId}: ${reason}`,
      );
      return { ok: false, reason };
    }
  }

  private normalizeEntityType(raw?: string): string {
    return (raw ?? '').trim().toUpperCase().replaceAll('-', '_');
  }

  private extractBody(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const body = payload.body;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return payload;
  }

  private async resolveActorUserId(
    restaurantId: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    for (const key of ['userId', 'waiterId', 'actorUserId'] as const) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    const membership = await this.prisma.restaurantMembership.findFirst({
      where: {
        restaurantId,
        user: { isActive: true },
        role: { name: { in: ['OWNER', 'MANAGER'] } },
      },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });

    if (!membership?.userId) {
      throw new NotFoundException('no_edge_actor_user');
    }

    return membership.userId;
  }

  private resolveSessionId(
    payload: Record<string, unknown>,
    body: Record<string, unknown>,
  ): string {
    const sessionId =
      this.optionalString(payload, 'sessionId') ??
      this.optionalString(body, 'sessionId');
    if (!sessionId) {
      throw new BadRequestException('missing_sessionId');
    }
    return sessionId;
  }

  private async applyOpen(
    restaurantId: string,
    userId: string,
    clientMutationId: string,
    body: Record<string, unknown>,
  ): Promise<ApplyResult> {
    const dto: OpenTableSessionDto = {
      tableId: this.requireString(body, 'tableId'),
      guestCount: this.optionalInt(body, 'guestCount') ?? 2,
      waiterName: this.optionalString(body, 'waiterName'),
      customerName: this.optionalString(body, 'customerName'),
      notes: this.optionalString(body, 'notes'),
      clientMutationId:
        this.optionalString(body, 'clientMutationId') ?? clientMutationId,
    };

    const result = await this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'OPEN_SESSION',
      () =>
        this.tableSessions.open(
          restaurantId,
          userId,
          dto,
          dto.waiterName ?? undefined,
        ),
    );

    return { ok: true, result };
  }

  private async applyAddItems(
    restaurantId: string,
    userId: string,
    clientMutationId: string,
    payload: Record<string, unknown>,
    body: Record<string, unknown>,
  ): Promise<ApplyResult> {
    const sessionId = this.resolveSessionId(payload, body);
    const items = this.parseAddItems(body);
    if (items.length === 0) {
      return { ok: false, reason: 'missing_items' };
    }

    const dto: AddSessionItemsDto = {
      items,
      clientMutationId:
        this.optionalString(body, 'clientMutationId') ?? clientMutationId,
    };

    const result = await this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'ADD_ITEMS',
      () => this.tableSessions.addItems(restaurantId, sessionId, userId, dto),
    );

    return { ok: true, result };
  }

  private async applySendKitchen(
    restaurantId: string,
    userId: string,
    clientMutationId: string,
    payload: Record<string, unknown>,
    body: Record<string, unknown>,
  ): Promise<ApplyResult> {
    const sessionId = this.resolveSessionId(payload, body);
    const itemIds = this.parseStringArray(body.itemIds);

    const dto: SendToKitchenDto = {
      itemIds: itemIds.length > 0 ? itemIds : undefined,
      clientMutationId:
        this.optionalString(body, 'clientMutationId') ?? clientMutationId,
    };

    const result = await this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'SEND_KITCHEN',
      () =>
        this.tableSessions.sendToKitchen(restaurantId, sessionId, userId, dto),
    );

    return { ok: true, result };
  }

  private async applyClose(
    restaurantId: string,
    userId: string,
    clientMutationId: string,
    payload: Record<string, unknown>,
    body: Record<string, unknown>,
  ): Promise<ApplyResult> {
    const sessionId = this.resolveSessionId(payload, body);

    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, restaurantId },
      select: { id: true, status: true },
    });
    if (!session) {
      return { ok: false, reason: 'session_not_found' };
    }
    if (session.status === TableSessionStatus.CLOSED) {
      return { ok: true, result: { alreadyClosed: true } };
    }

    const paymentMethod = this.optionalString(body, 'paymentMethod') ?? 'cash';
    const dto: CloseTableSessionDto = {
      paymentMethod: paymentMethod as SessionPaymentMethod,
      itemIds: this.parseStringArray(body.itemIds),
      tip: this.optionalInt(body, 'tip'),
      manualDiscount: this.optionalInt(body, 'manualDiscount'),
      discountReason: this.optionalString(body, 'discountReason'),
      customerName: this.optionalString(body, 'customerName'),
      customerPhone: this.optionalString(body, 'customerPhone'),
      fiscalDocumentType: this.optionalString(body, 'fiscalDocumentType') as
        | CloseTableSessionDto['fiscalDocumentType']
        | undefined,
      customerDocType: this.optionalString(body, 'customerDocType'),
      customerDocNumber: this.optionalString(body, 'customerDocNumber'),
      customerIvaCondition: this.optionalInt(body, 'customerIvaCondition'),
      clientMutationId:
        this.optionalString(body, 'clientMutationId') ?? clientMutationId,
    };

    const result = await this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'CLOSE_SESSION',
      () =>
        this.tableSessions.close(
          restaurantId,
          sessionId,
          userId,
          dto,
          dto.customerName ?? undefined,
        ),
    );

    return { ok: true, result };
  }

  private async applyVoid(
    restaurantId: string,
    userId: string,
    clientMutationId: string,
    payload: Record<string, unknown>,
    body: Record<string, unknown>,
  ): Promise<ApplyResult> {
    const sessionId = this.resolveSessionId(payload, body);
    const dto: VoidTableSessionDto = {
      reason: this.optionalString(body, 'reason'),
      markTableCleaning: this.optionalBool(body, 'markTableCleaning'),
      clientMutationId:
        this.optionalString(body, 'clientMutationId') ?? clientMutationId,
    };

    const result = await this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'VOID_SESSION',
      () =>
        this.tableSessions.voidSession(restaurantId, sessionId, userId, dto),
    );

    return { ok: true, result };
  }

  private parseAddItems(body: Record<string, unknown>) {
    const rawItems = body.items;
    if (!Array.isArray(rawItems)) return [];

    return rawItems
      .filter(
        (item): item is Record<string, unknown> =>
          item != null && typeof item === 'object' && !Array.isArray(item),
      )
      .map((item) => ({
        dishId: this.requireString(item, 'dishId'),
        quantity: this.optionalInt(item, 'quantity') ?? 1,
        notes: this.optionalString(item, 'notes'),
        sendToKitchen: this.optionalBool(item, 'sendToKitchen') ?? false,
        modifiers: this.parseModifiers(item.modifiers),
      }));
  }

  private parseModifiers(raw: unknown) {
    if (!Array.isArray(raw)) return undefined;
    const modifiers = raw
      .filter(
        (entry): entry is Record<string, unknown> =>
          entry != null && typeof entry === 'object' && !Array.isArray(entry),
      )
      .map((entry) => ({
        modifierId: this.requireString(entry, 'modifierId'),
        name: this.requireString(entry, 'name'),
        priceAdjustment: Number(entry.priceAdjustment ?? 0),
      }));
    return modifiers.length > 0 ? modifiers : undefined;
  }

  private parseStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private requireString(source: Record<string, unknown>, key: string): string {
    const value = this.optionalString(source, key);
    if (!value) {
      throw new BadRequestException(`missing_${key}`);
    }
    return value;
  }

  private optionalString(
    source: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = source[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  private optionalInt(
    source: Record<string, unknown>,
    key: string,
  ): number | undefined {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private optionalBool(
    source: Record<string, unknown>,
    key: string,
  ): boolean | undefined {
    const value = source[key];
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  private errorReason(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        typeof response.message === 'string'
      ) {
        return response.message;
      }
      return 'bad_request';
    }
    if (error instanceof NotFoundException) {
      return 'not_found';
    }
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim().slice(0, 120);
    }
    return 'mutation_failed';
  }
}
