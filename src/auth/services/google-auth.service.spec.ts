import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';

const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;

  beforeEach(async () => {
    mockVerifyIdToken.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'GOOGLE_CLIENT_ID'
                ? 'test-client-id.apps.googleusercontent.com'
                : undefined,
          },
        },
      ],
    }).compile();

    service = module.get(GoogleAuthService);
  });

  it('is configured when GOOGLE_CLIENT_ID is set', () => {
    expect(service.isConfigured()).toBe(true);
  });

  it('verifies a valid Google credential', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-1',
        email: 'owner@example.com',
        email_verified: true,
        name: 'Owner Test',
        picture: 'https://example.com/avatar.png',
      }),
    });

    const result = await service.verifyIdToken('valid-credential');

    expect(result).toEqual({
      sub: 'google-sub-1',
      email: 'owner@example.com',
      emailVerified: true,
      name: 'Owner Test',
      picture: 'https://example.com/avatar.png',
    });
  });

  it('rejects unverified Google emails', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-1',
        email: 'owner@example.com',
        email_verified: false,
        name: 'Owner Test',
      }),
    });

    await expect(service.verifyIdToken('credential')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('GoogleAuthService without client id', () => {
  it('is not configured', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAuthService,
        {
          provide: ConfigService,
          useValue: { get: () => undefined },
        },
      ],
    }).compile();

    const unconfigured = module.get(GoogleAuthService);
    expect(unconfigured.isConfigured()).toBe(false);
    await expect(unconfigured.verifyIdToken('x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
