import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoCredentialsService } from './mercadopago-credentials.service';
import { MercadoPagoOAuthService } from './mercadopago-oauth.service';

const REFRESH_WINDOW_DAYS = 7;

@Injectable()
export class MercadoPagoOAuthRefreshTask {
  private readonly logger = new Logger(MercadoPagoOAuthRefreshTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: MercadoPagoCredentialsService,
    private readonly oauthService: MercadoPagoOAuthService,
  ) {}

  @Cron('0 4 * * *')
  async refreshExpiringTokens(): Promise<void> {
    if (!this.oauthService.isConfigured()) {
      return;
    }

    const threshold = new Date(
      Date.now() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const candidates = await this.prisma.mercadoPagoCredential.findMany({
      where: {
        connectedVia: 'oauth',
        refreshTokenCiphertext: { not: null },
        OR: [{ expiresAt: { lte: threshold } }, { expiresAt: null }],
      },
      select: { restaurantId: true },
    });

    if (candidates.length === 0) {
      return;
    }

    this.logger.log(
      `Renovando ${candidates.length} credencial(es) Mercado Pago OAuth próximas a expirar`,
    );

    for (const { restaurantId } of candidates) {
      try {
        const refreshToken =
          await this.credentialsService.getDecryptedRefreshToken(restaurantId);
        if (!refreshToken) continue;

        const next = await this.oauthService.refreshAccessToken(refreshToken);
        if (!next.access_token) {
          this.logger.warn(
            `Refresh sin access_token para restaurantId=${restaurantId}`,
          );
          continue;
        }

        await this.credentialsService.updateOAuthTokens({
          restaurantId,
          accessToken: next.access_token,
          refreshToken: next.refresh_token ?? refreshToken,
          expiresInSeconds: next.expires_in ?? null,
          scope: next.scope ?? null,
          livemode:
            typeof next.live_mode === 'boolean'
              ? next.live_mode
              : !next.access_token.startsWith('TEST-'),
        });
      } catch (err) {
        this.logger.error(
          `Error renovando MP OAuth para restaurantId=${restaurantId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}
