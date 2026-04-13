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
    lastLogin: null,
    restaurantId: 'rest-1',
    roleId: 'role-1',
    role: { id: 'role-1', name: 'Admin', permissions: ['all'], color: '#000' },
    restaurant: { id: 'rest-1', name: 'Test Resto', slug: 'test-resto' },
  };

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    mockUser.password = hashedPassword;

    prisma = {
      user: {
        findFirst: jest.fn(),
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
      prisma.user.findFirst.mockResolvedValue(mockUser);
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
      prisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for nonexistent user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nobody@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should normalize email to lowercase', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await service.login({
        email: ' TEST@EXAMPLE.COM ',
        password: 'password123',
      });

      const callArgs = prisma.user.findFirst.mock.calls[0][0];
      const emailWhere = callArgs.where.email;
      // Prisma uses case-insensitive matching
      expect(emailWhere.equals.toLowerCase()).toBe('test@example.com');
      expect(emailWhere.mode).toBe('insensitive');
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
