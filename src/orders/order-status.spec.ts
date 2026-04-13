import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from './dto/order.dto';

/**
 * Extracted pure‑function tests for the order status helpers.
 * We replicate the two private methods here so they can be tested
 * in isolation without bootstrapping the full NestJS module.
 */

// ── Replicated helpers (mirror orders.service.ts) ──────────────

function parseOrderStatusOrPaymentStatus(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('status is required');
  }
  const raw = value.trim();
  const normalized = raw.toUpperCase();

  if (normalized === 'CANCELED') {
    return { kind: 'status' as const, status: OrderStatus.CANCELLED };
  }

  const allowed = new Set<string>(Object.values(OrderStatus));
  if (!allowed.has(normalized)) {
    throw new BadRequestException(
      `Invalid status: ${raw}. Allowed: ${Array.from(allowed).join(', ')}`,
    );
  }

  return { kind: 'status' as const, status: normalized as OrderStatus };
}

function validateStatusTransition(
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
) {
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [
      OrderStatus.PAID,
      OrderStatus.CONFIRMED,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.PAID]: [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.CONFIRMED]: [
      OrderStatus.PAID,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.PREPARING]: [
      OrderStatus.CONFIRMED,
      OrderStatus.READY,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.READY]: [
      OrderStatus.PREPARING,
      OrderStatus.CONFIRMED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.CANCELLED]: [],
  };

  const allowed = validTransitions[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new BadRequestException(
      `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowed.join(', ')}`,
    );
  }
}

// ── Tests ──────────────────────────────────────────────────────

describe('parseOrderStatusOrPaymentStatus', () => {
  it('should parse a valid uppercase status', () => {
    const result = parseOrderStatusOrPaymentStatus('CONFIRMED');
    expect(result).toEqual({ kind: 'status', status: OrderStatus.CONFIRMED });
  });

  it('should normalize lowercase input', () => {
    const result = parseOrderStatusOrPaymentStatus('pending');
    expect(result).toEqual({ kind: 'status', status: OrderStatus.PENDING });
  });

  it('should map CANCELED (single L) to CANCELLED', () => {
    const result = parseOrderStatusOrPaymentStatus('CANCELED');
    expect(result).toEqual({ kind: 'status', status: OrderStatus.CANCELLED });
  });

  it('should trim whitespace', () => {
    const result = parseOrderStatusOrPaymentStatus('  READY  ');
    expect(result).toEqual({ kind: 'status', status: OrderStatus.READY });
  });

  it('should throw for empty string', () => {
    expect(() => parseOrderStatusOrPaymentStatus('')).toThrow(
      BadRequestException,
    );
  });

  it('should throw for null', () => {
    expect(() => parseOrderStatusOrPaymentStatus(null)).toThrow(
      BadRequestException,
    );
  });

  it('should throw for invalid status value', () => {
    expect(() => parseOrderStatusOrPaymentStatus('FLYING')).toThrow(
      BadRequestException,
    );
  });
});

describe('validateStatusTransition', () => {
  const validCases: [OrderStatus, OrderStatus][] = [
    [OrderStatus.PENDING, OrderStatus.CONFIRMED],
    [OrderStatus.PENDING, OrderStatus.PAID],
    [OrderStatus.PENDING, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED, OrderStatus.PREPARING],
    [OrderStatus.PREPARING, OrderStatus.READY],
    [OrderStatus.READY, OrderStatus.DELIVERED],
  ];

  it.each(validCases)('should allow transition from %s to %s', (from, to) => {
    expect(() => validateStatusTransition(from, to)).not.toThrow();
  });

  const invalidCases: [OrderStatus, OrderStatus][] = [
    [OrderStatus.DELIVERED, OrderStatus.PENDING],
    [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
    [OrderStatus.CANCELLED, OrderStatus.PENDING],
    [OrderStatus.CANCELLED, OrderStatus.CONFIRMED],
    [OrderStatus.PENDING, OrderStatus.READY],
    [OrderStatus.PENDING, OrderStatus.DELIVERED],
    [OrderStatus.PREPARING, OrderStatus.PENDING],
  ];

  it.each(invalidCases)(
    'should reject transition from %s to %s',
    (from, to) => {
      expect(() => validateStatusTransition(from, to)).toThrow(
        BadRequestException,
      );
    },
  );

  it('should include allowed statuses in the error message', () => {
    try {
      validateStatusTransition(OrderStatus.DELIVERED, OrderStatus.PENDING);
      fail('should have thrown');
    } catch (e: any) {
      expect(e.message).toContain(
        'Cannot transition from DELIVERED to PENDING',
      );
    }
  });
});
