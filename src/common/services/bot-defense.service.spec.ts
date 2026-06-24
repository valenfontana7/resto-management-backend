import { BadRequestException } from '@nestjs/common';
import { BotDefenseService } from './bot-defense.service';

describe('BotDefenseService', () => {
  const service = new BotDefenseService();

  afterEach(() => {
    delete process.env.REGISTRATION_REJECT_PLUS_ALIAS;
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it('detects honeypot triggers', () => {
    expect(service.isHoneypotTriggered('')).toBe(false);
    expect(service.isHoneypotTriggered('  ')).toBe(false);
    expect(service.isHoneypotTriggered('https://spam.test')).toBe(true);
  });

  it('rejects plus alias when enabled', () => {
    process.env.REGISTRATION_REJECT_PLUS_ALIAS = 'true';

    expect(() =>
      service.assertRegistrationEmailPolicy('user+1@gmail.com'),
    ).toThrow(BadRequestException);
    expect(() =>
      service.assertRegistrationEmailPolicy('user@gmail.com'),
    ).not.toThrow();
  });

  it('builds decoy auth response without persisting', () => {
    const response = service.buildDecoyAuthResponse({
      email: 'Bot@Example.com',
      name: 'Bot',
    });

    expect(response.user.email).toBe('bot@example.com');
    expect(response.token.startsWith('decoy.')).toBe(true);
  });
});
