import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';

@Injectable()
export class UserPaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoService: MercadoPagoService,
  ) {}

  async listForUser(userId: string) {
    const methods = await this.prisma.userPaymentMethod.findMany({
      where: { userId },
    });
    const mapped = methods.map((pm) => ({
      id: pm.id,
      mpCardId: pm.mpCardId,
      mpCustomerId: pm.mpCustomerId,
      type: pm.type,
      brand: pm.brand,
      issuerId: pm.issuerId ?? null,
      issuerName: pm.issuerName ?? null,
      last4: pm.last4,
      expiryMonth: pm.expiryMonth,
      expiryYear: pm.expiryYear,
      cardholderName: pm.cardholderName,
      isDefault: pm.isDefault,
      createdAt: pm.createdAt,
      issuer: pm.issuerName
        ? { name: pm.issuerName, id: pm.issuerId }
        : pm.brand
          ? { name: pm.brand, id: null }
          : null,
    }));

    // Ordenar: primero los que tienen isDefault=true, luego por createdAt asc
    mapped.sort((a, b) => {
      if (a.isDefault === b.isDefault) {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      }
      return a.isDefault ? -1 : 1;
    });

    return { paymentMethods: mapped };
  }

  async createForUser(user: any, token: string) {
    if (!token) throw new BadRequestException('token is required');

    // Reuse existing mpCustomerId for this user if any
    const existing = await this.prisma.userPaymentMethod.findFirst({
      where: { userId: user.id, mpCustomerId: { not: null } },
    });
    let mpCustomerId = existing?.mpCustomerId ?? null;

    if (!mpCustomerId) {
      // create customer in platform (global)
      mpCustomerId = await this.mercadoPagoService.createCustomer(
        user.restaurantId ?? '',
        { email: user.email, description: user.name },
        true,
      );
    }

    // create card in MP (platform account)
    const cardInfo = await this.mercadoPagoService.createCardForCustomer(
      user.restaurantId ?? '',
      mpCustomerId,
      token,
      true,
    );

    const pm = await this.prisma.userPaymentMethod.create({
      data: {
        user: { connect: { id: user.id } },
        mpCustomerId,
        mpCardId: String(cardInfo.id ?? cardInfo.card?.id ?? ''),
        type: 'credit_card',
        brand:
          cardInfo?.card?.brand ||
          cardInfo?.card?.issuer?.name?.toLowerCase() ||
          'card',
        issuerId: cardInfo?.card?.issuer?.id ?? null,
        issuerName: cardInfo?.card?.issuer?.name ?? null,
        last4:
          cardInfo?.last_four ||
          cardInfo?.last_four_digits ||
          cardInfo?.card?.last_four ||
          cardInfo?.card?.last_four_digits ||
          '',
        expiryMonth: Number(
          cardInfo?.card?.expiration_month || cardInfo?.expiration_month || 0,
        ),
        expiryYear: Number(
          cardInfo?.card?.expiration_year || cardInfo?.expiration_year || 0,
        ),
        cardholderName:
          cardInfo?.card?.cardholder?.name ||
          cardInfo?.cardholder?.name ||
          null,
      },
    });

    // If issuer info missing, try to fetch full card details from MercadoPago and update
    try {
      if ((!pm.issuerId || !pm.issuerName) && pm.mpCustomerId && pm.mpCardId) {
        const full = await this.mercadoPagoService
          .getCardForCustomer(
            user.restaurantId ?? '',
            pm.mpCustomerId,
            pm.mpCardId,
            true,
          )
          .catch(() => null);
        if (full) {
          const issuerId = full?.card?.issuer?.id ?? null;
          const issuerName = full?.card?.issuer?.name ?? null;
          if (issuerId || issuerName) {
            const updated = await this.prisma.userPaymentMethod.update({
              where: { id: pm.id },
              data: { issuerId, issuerName },
            });
            return { paymentMethod: updated };
          }
        }
      }
    } catch (e) {
      // ignore errors fetching issuer
    }

    return { paymentMethod: pm };
  }

  async deleteForUser(userId: string, id: string) {
    const pm = await this.prisma.userPaymentMethod.findUnique({
      where: { id },
    });
    if (!pm || pm.userId !== userId)
      throw new NotFoundException('Payment method not found');

    // attempt delete in MP if present
    if (pm.mpCustomerId && pm.mpCardId) {
      try {
        await this.mercadoPagoService.deleteCardForCustomer(
          '',
          pm.mpCustomerId,
          pm.mpCardId,
        );
      } catch (e) {
        // ignore MP deletion errors; still remove local record
      }
    }

    await this.prisma.userPaymentMethod.delete({ where: { id } });
  }
}
