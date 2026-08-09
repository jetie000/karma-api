import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { User as DbUser } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHmac } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateUserRequest, User } from '../../types';

const COINS_PER_REQUEST = 10;
const FREE_DAILY_COINS = 200;
const PRO_MONTHLY_COINS = 5000;
const PRO_PLUS_MONTHLY_COINS = 10000;

const SALT_ROUNDS = 10;

function hashGoogleSubject(googleSub: string): string {
  const secret = process.env.GOOGLE_SUB_SECRET;
  if (!secret) {
    throw new Error('GOOGLE_SUB_SECRET is not set');
  }
  return createHmac('sha256', secret).update(googleSub).digest('hex');
}

function toPublicUser(u: DbUser): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    country: u.country,
    botPersonality: u.botPersonality,
    karmaDailyGoal: u.karmaDailyGoal,
    karma: u.karma,
    isNotificationReminder: u.isNotificationReminder,
    karmaCoins: u.karmaCoins,
    subscriptionType: u.subscriptionType,
    subscriptionExpiry: u.subscriptionExpiry?.toISOString() ?? null,
  };
}

function isSameUTCDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function isSameUTCMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Email/password sign-up. If the email already exists from Google-only login,
   * sets the password on that same row (link email auth to the Google account).
   */
  async createLocalUser(
    email: string,
    name: string,
    password: string,
  ): Promise<DbUser> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (existing?.passwordHash) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, name: name.trim() },
      });
    }
    return this.prisma.user.create({
      data: {
        email: normalized,
        name: name.trim(),
        passwordHash,
      },
    });
  }

  /**
   * Google OAuth: match by hashed sub, or link / create by verified email.
   */
  async upsertGoogleUser(profile: {
    sub: string;
    email: string;
    name: string;
  }): Promise<DbUser> {
    const normalizedEmail = profile.email.trim().toLowerCase();
    const hashedSub = hashGoogleSubject(profile.sub);
    const bySub = await this.prisma.user.findUnique({
      where: { hashedSub },
    });
    if (bySub) {
      return this.prisma.user.update({
        where: { id: bySub.id },
        data: {
          email: normalizedEmail,
          name: profile.name.trim(),
        },
      });
    }
    const byEmail = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (byEmail) {
      if (byEmail.hashedSub && byEmail.hashedSub !== hashedSub) {
        throw new ConflictException(
          'This email is already linked to another Google account',
        );
      }
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          hashedSub,
          name: profile.name.trim(),
        },
      });
    }
    return this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name: profile.name.trim(),
        hashedSub,
        passwordHash: null,
      },
    });
  }

  async upsertAppleUser(profile: {
    sub: string;
    email: string;
    name: string;
  }): Promise<DbUser> {
    const hashedAppleSub = this.hashAppleSubject(profile.sub);

    const byApple = await this.prisma.user.findUnique({
      where: { hashedAppleSub },
    });
    if (byApple) {
      return this.prisma.user.update({
        where: { id: byApple.id },
        data: { name: profile.name.trim() || byApple.name },
      });
    }

    if (profile.email) {
      const normalizedEmail = profile.email.trim().toLowerCase();
      const byEmail = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (byEmail) {
        return this.prisma.user.update({
          where: { id: byEmail.id },
          data: { hashedAppleSub, name: profile.name.trim() || byEmail.name },
        });
      }
      return this.prisma.user.create({
        data: {
          email: normalizedEmail,
          name: profile.name.trim() || normalizedEmail.split('@')[0],
          hashedAppleSub,
          passwordHash: null,
        },
      });
    }

    // No email available (privacy relay hidden email) — generate a placeholder
    const placeholderEmail = `apple_${hashedAppleSub.slice(0, 12)}@privaterelay.appleid.com`;
    return this.prisma.user.create({
      data: {
        email: placeholderEmail,
        name: profile.name.trim() || `Apple User`,
        hashedAppleSub,
        passwordHash: null,
      },
    });
  }

  private hashAppleSubject(appleSub: string): string {
    const secret =
      process.env.APPLE_SUB_SECRET ?? process.env.GOOGLE_SUB_SECRET;
    if (!secret) {
      throw new Error('APPLE_SUB_SECRET is not set');
    }
    return createHmac('sha256', secret).update(appleSub).digest('hex');
  }

  async requireById(id: string): Promise<DbUser> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) {
      throw new NotFoundException('User not found');
    }
    return u;
  }

  async validateLocalUser(email: string, password: string): Promise<DbUser> {
    const normalized = email.trim().toLowerCase();
    const u = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (!u) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!u.passwordHash) {
      throw new UnauthorizedException(
        'Use Google sign-in or complete email sign-up for this account',
      );
    }
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return u;
  }

  async getPublicUser(id: string): Promise<User> {
    const u = await this.requireById(id);
    return toPublicUser(u);
  }

  /**
   * Checks if daily/monthly coin reset is due, resets if needed, then
   * deducts COINS_PER_REQUEST. Throws 402 if the user has insufficient coins.
   */
  async checkResetAndDeductCoins(userId: string): Promise<void> {
    const user = await this.requireById(userId);
    const now = new Date();
    const lastReset = user.lastCoinReset;

    let shouldReset = false;
    let resetAmount = FREE_DAILY_COINS;

    if (user.subscriptionType === 'pro') {
      resetAmount = PRO_MONTHLY_COINS;
      shouldReset = !isSameUTCMonth(now, lastReset);
    } else if (user.subscriptionType === 'pro_plus') {
      resetAmount = PRO_PLUS_MONTHLY_COINS;
      shouldReset = !isSameUTCMonth(now, lastReset);
    } else {
      shouldReset = !isSameUTCDay(now, lastReset);
    }

    const effectiveCoins = shouldReset ? resetAmount : user.karmaCoins;

    if (effectiveCoins < COINS_PER_REQUEST) {
      throw new HttpException(
        { message: 'Insufficient KarmaCoins', code: 'INSUFFICIENT_COINS' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        karmaCoins: effectiveCoins - COINS_PER_REQUEST,
        ...(shouldReset && { lastCoinReset: now }),
      },
    });
  }

  async activateSubscription(
    userId: string,
    subscriptionType: string,
  ): Promise<User> {
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);

    const coinAmount =
      subscriptionType === 'pro' ? PRO_MONTHLY_COINS : PRO_PLUS_MONTHLY_COINS;

    const u = await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionType,
        subscriptionExpiry: expiry,
        karmaCoins: coinAmount,
        lastCoinReset: new Date(),
      },
    });
    return toPublicUser(u);
  }

  async updateUser(id: string, body: UpdateUserRequest): Promise<User> {
    await this.requireById(id);
    const u = await this.prisma.user.update({
      where: { id },
      data: {
        ...(body.country !== undefined && { country: body.country }),
        ...(body.botPersonality !== undefined && {
          botPersonality: body.botPersonality,
        }),
        ...(body.karmaDailyGoal !== undefined && {
          karmaDailyGoal: body.karmaDailyGoal,
        }),
        ...(body.isNotificationReminder !== undefined && {
          isNotificationReminder: body.isNotificationReminder,
        }),
      },
    });
    return toPublicUser(u);
  }
}
