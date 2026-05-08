import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

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
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    jwt = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
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
    it('should return password setup mode for active pending users', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          ...mockUser,
          passwordSetupRequired: true,
        },
      ]);

      const result = await service.getLoginIntent({
        email: ' TEST@EXAMPLE.COM ',
      });

      expect(result).toEqual({
        mode: 'password_setup',
        email: 'test@example.com',
        name: 'Test User',
      });
    });

    it('should return password mode for non-pending users', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser]);

      const result = await service.getLoginIntent({
        email: 'test@example.com',
      });

      expect(result).toEqual({
        mode: 'password',
        email: 'test@example.com',
      });
    });

    it('should prefer password mode when there is an active configured duplicate', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          ...mockUser,
          id: 'user-pending',
          passwordSetupRequired: true,
        },
        mockUser,
      ]);

      const result = await service.getLoginIntent({
        email: 'test@example.com',
      });

      expect(result).toEqual({
        mode: 'password',
        email: 'test@example.com',
      });
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
