import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { MercadoPagoCredentialsService } from './mercadopago-credentials.service';

interface OAuthStatePayload {
  restaurantId: string;
  returnTo?: string;
  iat: number;
  nonce: string;
  codeVerifier: string;
}

interface MercadoPagoTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  user_id?: number;
  public_key?: string;
  live_mode?: boolean;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const MP_OAUTH_AUTHORIZE_URL = 'https://auth.mercadopago.com.ar/authorization';
const MP_OAUTH_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

@Injectable()
export class MercadoPagoOAuthService {
  private readonly logger = new Logger(MercadoPagoOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly credentialsService: MercadoPagoCredentialsService,
  ) {}

  private getClientId(): string {
    const v = this.config.get<string>('MERCADOPAGO_OAUTH_CLIENT_ID')?.trim();
    if (!v) {
      throw new Error('MERCADOPAGO_OAUTH_CLIENT_ID no configurado');
    }
    return v;
  }

  private getClientSecret(): string {
    const v = this.config
      .get<string>('MERCADOPAGO_OAUTH_CLIENT_SECRET')
      ?.trim();
    if (!v) {
      throw new Error('MERCADOPAGO_OAUTH_CLIENT_SECRET no configurado');
    }
    return v;
  }

  private getRedirectUri(): string {
    const v = this.config.get<string>('MERCADOPAGO_OAUTH_REDIRECT_URI')?.trim();
    if (!v) {
      throw new Error('MERCADOPAGO_OAUTH_REDIRECT_URI no configurado');
    }
    return v;
  }

  private getStateSecret(): string {
    const v = this.config.get<string>('MERCADOPAGO_OAUTH_STATE_SECRET')?.trim();
    if (!v || v.length < 16) {
      throw new Error(
        'MERCADOPAGO_OAUTH_STATE_SECRET debe tener al menos 16 caracteres',
      );
    }
    return v;
  }

  private getFrontendUrl(): string {
    const v = this.config.get<string>('FRONTEND_URL')?.trim();
    if (!v) return '';
    return v.replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return (
      !!this.config.get<string>('MERCADOPAGO_OAUTH_CLIENT_ID')?.trim() &&
      !!this.config.get<string>('MERCADOPAGO_OAUTH_CLIENT_SECRET')?.trim() &&
      !!this.config.get<string>('MERCADOPAGO_OAUTH_REDIRECT_URI')?.trim() &&
      !!this.config.get<string>('MERCADOPAGO_OAUTH_STATE_SECRET')?.trim()
    );
  }

  buildAuthorizationUrl(restaurantId: string, returnTo?: string): string {
    const clientId = this.getClientId();
    const redirectUri = this.getRedirectUri();
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    const state = this.signState({
      restaurantId,
      returnTo: returnTo || undefined,
      iat: Date.now(),
      nonce: crypto.randomBytes(12).toString('hex'),
      codeVerifier,
    });

    const codeChallenge = this.toCodeChallenge(codeVerifier);

    const url = new URL(MP_OAUTH_AUTHORIZE_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('platform_id', 'mp');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('code_challenge', codeChallenge);
    return url.toString();
  }

  verifyState(state: string): OAuthStatePayload {
    const parts = state.split('.');
    if (parts.length !== 2) {
      throw new BadRequestException('state inválido');
    }
    const [payloadB64, sig] = parts;
    const expected = this.hmac(payloadB64);
    if (!this.safeEqual(sig, expected)) {
      throw new UnauthorizedException('state firma inválida');
    }

    let payload: OAuthStatePayload;
    try {
      const raw = Buffer.from(payloadB64, 'base64url').toString('utf8');
      payload = JSON.parse(raw) as OAuthStatePayload;
    } catch {
      throw new BadRequestException('state no parseable');
    }

    if (
      !payload?.restaurantId ||
      typeof payload.iat !== 'number' ||
      !payload.codeVerifier
    ) {
      throw new BadRequestException('state incompleto');
    }
    if (Date.now() - payload.iat > STATE_TTL_MS) {
      throw new UnauthorizedException('state expirado');
    }

    return payload;
  }

  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
  ): Promise<MercadoPagoTokenResponse> {
    const form = new URLSearchParams();
    form.set('grant_type', 'authorization_code');
    form.set('client_id', this.getClientId());
    form.set('client_secret', this.getClientSecret());
    form.set('code', code);
    form.set('redirect_uri', this.getRedirectUri());
    form.set('code_verifier', codeVerifier);

    return this.callTokenEndpoint(form);
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<MercadoPagoTokenResponse> {
    const form = new URLSearchParams();
    form.set('grant_type', 'refresh_token');
    form.set('client_id', this.getClientId());
    form.set('client_secret', this.getClientSecret());
    form.set('refresh_token', refreshToken);

    return this.callTokenEndpoint(form);
  }

  async handleCallback(params: {
    code: string;
    state: string;
  }): Promise<{ restaurantId: string; returnTo?: string }> {
    const statePayload = this.verifyState(params.state);
    const token = await this.exchangeCodeForToken(
      params.code,
      statePayload.codeVerifier,
    );

    if (!token.access_token) {
      throw new BadRequestException('Mercado Pago no devolvió access_token');
    }

    await this.credentialsService.setOAuthCredentialsAndEnableDigitalWallet({
      restaurantId: statePayload.restaurantId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      publishableKey: token.public_key ?? null,
      mpUserId: token.user_id ?? null,
      scope: token.scope ?? null,
      expiresInSeconds: token.expires_in ?? null,
      livemode:
        typeof token.live_mode === 'boolean'
          ? token.live_mode
          : !token.access_token.startsWith('TEST-'),
    });

    return {
      restaurantId: statePayload.restaurantId,
      returnTo: statePayload.returnTo,
    };
  }

  buildFrontendRedirect(
    returnTo: string | undefined,
    status: 'connected' | 'error',
    extra?: Record<string, string>,
  ): string {
    const base = this.getFrontendUrl();
    const safePath = this.sanitizeReturnTo(returnTo);
    const target = base ? `${base}${safePath}` : safePath;

    const url = new URL(target, base || 'http://localhost:3000');
    url.searchParams.set('mp', status);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  private sanitizeReturnTo(returnTo: string | undefined): string {
    if (!returnTo) return '/admin/settings';
    if (!returnTo.startsWith('/') || returnTo.startsWith('//')) {
      return '/admin/settings';
    }
    return returnTo;
  }

  private signState(payload: OAuthStatePayload): string {
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );
    const sig = this.hmac(payloadB64);
    return `${payloadB64}.${sig}`;
  }

  private toCodeChallenge(codeVerifier: string): string {
    return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  }

  private hmac(data: string): string {
    return crypto
      .createHmac('sha256', this.getStateSecret())
      .update(data)
      .digest('base64url');
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  }

  private async callTokenEndpoint(
    form: URLSearchParams,
  ): Promise<MercadoPagoTokenResponse> {
    const resp = await fetch(MP_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      this.logger.warn(
        `MP OAuth token endpoint respondió ${resp.status}: ${text.slice(0, 200)}`,
      );
      throw new BadRequestException(
        `Mercado Pago rechazó el intercambio de token (${resp.status})`,
      );
    }

    return (await resp.json()) as MercadoPagoTokenResponse;
  }
}
