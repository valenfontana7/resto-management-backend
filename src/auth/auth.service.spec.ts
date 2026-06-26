import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import {
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { RolesCatalogService } from '../common/services/roles-catalog.service';
import { OwnershipService } from '../common/services/ownership.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    password: '',
    name: 'Test User',
    isActive: true,
    passwordSetupRequired: false,
    lastLogin: null,
    restaurantId: 'rest-1',
    roleId: 'role-1',
    activationCodeHash: null,
    activationCodeExpiresAt: null,
    activationCodeAttempts: 0,
    role: { id: 'role-1', name: 'Admin', permissions: ['all'], color: '#000' },
    restaurant: { id: 'rest-1', name: 'Test Resto', slug: 'test-resto' },
  };

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    mockUser.password = hashedPassword;

    prisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      restaurant: {
        findUnique: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
        createMany: jest.fn(),
      },
      authLoginLink: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      authPasswordResetLink: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((input) =>
        Array.isArray(input) ? Promise.all(input) : input(prisma),
      ),
    };

    jwt = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    };

    const rolesCatalog = {
      ensureSystemRoles: jest.fn().mockResolvedValue(undefined),
      getOwnerRoleId: jest.fn().mockResolvedValue('role-owner'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: RolesCatalogService, useValue: rolesCatalog },
        {
          provide: OwnershipService,
          useValue: {
            verifyUserBelongsToRestaurant: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should return auth response for valid credentials', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser]);
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('token', 'mock-jwt-token');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser]);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for nonexistent user', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(
        service.login({
          email: 'nobody@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          ...mockUser,
          isActive: false,
        },
      ]);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password setup is pending', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          ...mockUser,
          passwordSetupRequired: true,
        },
      ]);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should normalize email to lowercase', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser]);
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await service.login({
        email: ' TEST@EXAMPLE.COM ',
        password: 'password123',
      });

      const callArgs = prisma.user.findMany.mock.calls[0][0];
      const emailWhere = callArgs.where.email;
      // Prisma uses case-insensitive matching
      expect(emailWhere.equals.toLowerCase()).toBe('test@example.com');
      expect(emailWhere.mode).toBe('insensitive');
    });

    it('should authenticate the matching configured user when duplicate emails exist', async () => {
      const otherUser = {
        ...mockUser,
        id: 'user-2',
        password: await bcrypt.hash('other-password', 10),
      };

      prisma.user.findMany.mockResolvedValue([otherUser, mockUser]);
      prisma.user.update.mockResolvedValue(mockUser);

      await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
        }),
      );
    });
  });

  describe('login intent and password setup', () => {
    it('should always return password mode without enumerating account state', async () => {
      const result = await service.getLoginIntent({
        email: ' TEST@EXAMPLE.COM ',
      });

      expect(result).toEqual({
        mode: 'password',
        email: 'test@example.com',
      });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('should return password mode for all emails', async () => {
      const result = await service.getLoginIntent({
        email: 'test@example.com',
      });

      expect(result).toEqual({
        mode: 'password',
        email: 'test@example.com',
      });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('should not query the database for duplicate account resolution', async () => {
      const result = await service.getLoginIntent({
        email: 'test@example.com',
      });

      expect(result).toEqual({
        mode: 'password',
        email: 'test@example.com',
      });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('should set password and complete login for pending users', async () => {
      const activationCodeHash = await bcrypt.hash('482913', 10);
      prisma.user.findMany.mockResolvedValue([
        {
          ...mockUser,
          passwordSetupRequired: true,
          activationCodeHash,
          activationCodeExpiresAt: new Date(Date.now() + 60_000),
          activationCodeAttempts: 0,
        },
      ]);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        passwordSetupRequired: false,
      });
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordSetupRequired: false,
      });

      const result = await service.completePasswordSetup({
        email: 'test@example.com',
        activationCode: '482913',
        password: 'Newpass123',
      });

      expect(result).toHaveProperty('token', 'mock-jwt-token');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            password: expect.any(String),
            passwordSetupRequired: false,
            activationCodeHash: null,
            activationCodeExpiresAt: null,
            activationCodeAttempts: 0,
            lastLogin: expect.any(Date),
          }),
        }),
      );
    });

    it('should reject invalid activation codes and increment attempts', async () => {
      const activationCodeHash = await bcrypt.hash('482913', 10);
      prisma.user.findMany.mockResolvedValue([
        {
          ...mockUser,
          passwordSetupRequired: true,
          activationCodeHash,
          activationCodeExpiresAt: new Date(Date.now() + 60_000),
          activationCodeAttempts: 0,
        },
      ]);

      await expect(
        service.completePasswordSetup({
          email: 'test@example.com',
          activationCode: '111111',
          password: 'Newpass123',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { activationCodeAttempts: { increment: 1 } },
      });
    });
  });

  describe('magic link', () => {
    it('should create a one-time login link for configured active users', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.authLoginLink.updateMany.mockResolvedValue({ count: 1 });
      prisma.authLoginLink.create.mockResolvedValue({
        id: 'link-1',
        userId: mockUser.id,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        createdAt: new Date(),
      });

      const result = await service.requestMagicLink({
        email: ' TEST@EXAMPLE.COM ',
        redirect: '/admin/orders',
      });

      expect(result.sent).toBe(true);
      expect(result.expiresInMinutes).toBe(15);
      expect(result.devLink).toContain('/admin/magic-link');
      expect(result.devLink).toContain('redirect=%2Fadmin%2Forders');
      expect(prisma.authLoginLink.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUser.id,
            usedAt: null,
          }),
        }),
      );
      expect(prisma.authLoginLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser.id,
            tokenHash: expect.any(String),
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should sanitize auth callback redirects to admin root', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.authLoginLink.updateMany.mockResolvedValue({ count: 1 });
      prisma.authLoginLink.create.mockResolvedValue({
        id: 'link-1',
        userId: mockUser.id,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        createdAt: new Date(),
      });

      const result = await service.requestMagicLink({
        email: 'test@example.com',
        redirect: '/admin/magic-link?token=stale',
      });

      expect(result.devLink).toContain('redirect=%2Fadmin');
      expect(result.devLink).not.toContain('redirect=%2Fadmin%2Fmagic-link');
    });

    it('should return generic response without creating link when user is missing', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.requestMagicLink({
        email: 'missing@example.com',
      });

      expect(result.sent).toBe(true);
      expect(prisma.authLoginLink.create).not.toHaveBeenCalled();
    });

    it('should consume a valid magic link and return an auth response', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.authLoginLink.updateMany.mockResolvedValue({ count: 1 });
      prisma.authLoginLink.create.mockResolvedValue({
        id: 'link-1',
        userId: mockUser.id,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        createdAt: new Date(),
      });
      prisma.user.update.mockResolvedValue(mockUser);

      const request = await service.requestMagicLink({
        email: 'test@example.com',
      });
      const rawToken = new URL(request.devLink!).searchParams.get('token')!;
      const createdTokenHash =
        prisma.authLoginLink.create.mock.calls[0][0].data.tokenHash;

      prisma.authLoginLink.findUnique.mockResolvedValue({
        id: 'link-1',
        userId: mockUser.id,
        tokenHash: createdTokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        createdAt: new Date(),
        user: mockUser,
      });

      const result = await service.consumeMagicLink({ token: rawToken });

      expect(result).toHaveProperty('token', 'mock-jwt-token');
      expect(prisma.authLoginLink.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: createdTokenHash },
        }),
      );
      expect(prisma.authLoginLink.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            usedAt: null,
          }),
          data: { usedAt: expect.any(Date) },
        }),
      );
    });

    it('should reject expired or already used magic links', async () => {
      prisma.authLoginLink.findUnique.mockResolvedValue({
        id: 'link-1',
        userId: mockUser.id,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1_000),
        usedAt: null,
        createdAt: new Date(),
        user: mockUser,
      });

      await expect(
        service.consumeMagicLink({
          token: 'abcdefghijklmnopqrstuvwxyz1234567890',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('should update password when current password is valid', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        password: mockUser.password,
        isActive: true,
        passwordSetupRequired: false,
        deletedAt: null,
      });
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.changePassword(mockUser.id, {
        currentPassword: 'password123',
        newPassword: 'Newpass123',
      });

      expect(result.message).toBe('Password updated successfully');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { password: expect.any(String) },
      });
    });

    it('should reject incorrect current password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        password: mockUser.password,
        isActive: true,
        passwordSetupRequired: false,
        deletedAt: null,
      });

      await expect(
        service.changePassword(mockUser.id, {
          currentPassword: 'wrong-password',
          newPassword: 'Newpass123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject when password setup is still pending', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        password: mockUser.password,
        isActive: true,
        passwordSetupRequired: true,
        deletedAt: null,
      });

      await expect(
        service.changePassword(mockUser.id, {
          currentPassword: 'password123',
          newPassword: 'Newpass123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('password reset', () => {
    it('should send reset link for configured active users', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.authPasswordResetLink.updateMany.mockResolvedValue({ count: 0 });
      prisma.authPasswordResetLink.create.mockResolvedValue({ id: 'reset-1' });

      const result = await service.requestPasswordReset({
        email: 'test@example.com',
      });

      expect(result.sent).toBe(true);
      expect(result.expiresInMinutes).toBe(60);
      expect(prisma.authPasswordResetLink.create).toHaveBeenCalled();
    });

    it('should return generic response when user is missing', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.requestPasswordReset({
        email: 'missing@example.com',
      });

      expect(result.sent).toBe(true);
      expect(prisma.authPasswordResetLink.create).not.toHaveBeenCalled();
    });

    it('should reset password with a valid token', async () => {
      prisma.authPasswordResetLink.findUnique.mockResolvedValue({
        id: 'reset-1',
        userId: mockUser.id,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        user: mockUser,
      });
      prisma.authPasswordResetLink.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.resetPassword({
        token: 'abcdefghijklmnopqrstuvwxyz1234567890',
        newPassword: 'Newpass123',
      });

      expect(result.message).toBe('Password reset successfully');
    });

    it('should reject invalid reset tokens', async () => {
      prisma.authPasswordResetLink.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'abcdefghijklmnopqrstuvwxyz1234567890',
          newPassword: 'Newpass123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('should throw ConflictException if email exists', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create user without restaurant when restaurantName not given', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        ...mockUser,
        restaurantId: null,
        roleId: null,
        role: null,
        restaurant: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        restaurantId: null,
        roleId: null,
        role: null,
        restaurant: null,
      });

      const result = await service.register({
        email: 'new@example.com',
        password: 'password123',
        name: 'New User',
      });

      expect(result).toHaveProperty('token');
      expect(prisma.user.create).toHaveBeenCalled();
    });
  });
});
