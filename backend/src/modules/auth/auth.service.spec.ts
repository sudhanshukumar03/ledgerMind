import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../../database/prisma.service.js';

/**
 * AuthService tests use a REAL bcrypt hash (low cost) rather than mocking
 * bcrypt, so the password-compare path is exercised for real. The DB and JWT
 * signer are mocked.
 */
describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let passwordHash: string;

  const makeUser = (overrides: Record<string, any> = {}) => ({
    id: 'user-1',
    email: 'finance@ledgermind.dev',
    name: 'Rohan Mehta',
    role: 'FINANCE',
    merchantId: 'merchant-1',
    passwordHash,
    ...overrides,
  });

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('demo1234', 4); // low cost — test speed
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: { user: { findUnique: jest.fn() } } },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('signed.jwt.token') } },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService);
  });

  describe('validateUser', () => {
    it('rejects an unknown email with a generic message (no user enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.validateUser('nobody@x.com', 'demo1234')).rejects.toThrow(UnauthorizedException);
      await expect(service.validateUser('nobody@x.com', 'demo1234')).rejects.toThrow('Invalid email or password');
    });

    it('rejects a wrong password with the same generic message', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await expect(service.validateUser('finance@ledgermind.dev', 'wrong-password')).rejects.toThrow('Invalid email or password');
    });

    it('returns the user WITHOUT the password hash on success', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      const result = await service.validateUser('finance@ledgermind.dev', 'demo1234');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toMatchObject({ id: 'user-1', role: 'FINANCE', merchantId: 'merchant-1' });
    });
  });

  describe('login', () => {
    it('signs a JWT carrying role + merchant and never leaks the hash', async () => {
      const jwt = service['jwtService'] as JwtService;
      const out = await service.login(makeUser());

      expect(jwt.sign).toHaveBeenCalledWith({
        userId: 'user-1',
        email: 'finance@ledgermind.dev',
        role: 'FINANCE',
        merchantId: 'merchant-1',
      });
      expect(out.access_token).toBe('signed.jwt.token');
      expect(out.user).not.toHaveProperty('passwordHash');
      expect(out.user).toMatchObject({ id: 'user-1', role: 'FINANCE' });
    });
  });
});
