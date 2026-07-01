import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleTokenPayload {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly client: OAuth2Client | null;

  constructor(private readonly config: ConfigService) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    this.client = clientId ? new OAuth2Client(clientId) : null;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  async verifyIdToken(credential: string): Promise<GoogleTokenPayload> {
    if (!this.client) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }

    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    if (!clientId) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }

    let ticket;
    try {
      ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (payload.email_verified !== true) {
      throw new UnauthorizedException('Google email is not verified');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: true,
      name: payload.name?.trim() || payload.email.split('@')[0] || 'Usuario',
      picture: payload.picture,
    };
  }
}
