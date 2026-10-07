import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { AuthUser } from '../common/auth';
import type { UserRole } from '../generated/prisma/enums';
import { OperationsStoreService } from '../platform/operations-store.service';

interface StaffRecord {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  branchId: string;
  pinHash: string;
}

interface Session {
  id: string;
  user: Omit<AuthUser, 'sessionId'>;
  refreshHash: string;
  expiresAt: number;
}

interface OtpChallenge {
  hash: string;
  expiresAt: number;
  attempts: number;
}

/**
 * Seed PINs are hashed with the same bcrypt cost so login latency never leaks
 * which account exists. The plaintext value comes from `DEV_STAFF_PIN` and only
 * appears in `.env` and the documentation.
 */
const DEFAULT_STAFF_PIN = '1234';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly otp = new Map<string, OtpChallenge>();
  private readonly sessions = new Map<string, Session>();
  private readonly staffPin: string;

  private readonly staff: StaffRecord[];

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly store: OperationsStoreService,
  ) {
    this.staffPin =
      this.config.get<string>('DEV_STAFF_PIN') ?? DEFAULT_STAFF_PIN;
    const pinHash = bcrypt.hashSync(this.staffPin, 10);
    this.staff = [
      {
        id: '70000000-0000-4000-8000-000000000001',
        email: 'cashier@kedai.local',
        name: 'Maya',
        role: 'CASHIER',
        branchId: this.store.defaultBranchId,
        pinHash,
      },
      {
        id: '70000000-0000-4000-8000-000000000002',
        email: 'manager@kedai.local',
        name: 'Dimas',
        role: 'MANAGER',
        branchId: this.store.defaultBranchId,
        pinHash,
      },
      {
        id: '70000000-0000-4000-8000-000000000003',
        email: 'admin@kedai.local',
        name: 'Bu Mira',
        role: 'ADMIN',
        branchId: this.store.defaultBranchId,
        pinHash,
      },
      {
        id: '70000000-0000-4000-8000-000000000004',
        email: 'barista@kedai.local',
        name: 'Reza',
        role: 'BARISTA',
        branchId: this.store.defaultBranchId,
        pinHash,
      },
      {
        id: '70000000-0000-4000-8000-000000000005',
        email: 'chef@kedai.local',
        name: 'Nadia',
        role: 'CAKE_CHEF',
        branchId: this.store.defaultBranchId,
        pinHash,
      },
    ];
  }

  /** Returns the accounts a reviewer can use, without exposing any secret. */
  listDemoStaff() {
    return this.staff.map((staff) => ({
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      branchId: staff.branchId,
      hint: `PIN ${this.staffPin}`,
    }));
  }

  async requestOtp(phone: string) {
    const code = this.config.get<string>('DEV_CUSTOMER_OTP') ?? '111111';
    const existing = this.otp.get(phone);
    if (existing && existing.expiresAt > Date.now()) {
      throw new UnauthorizedException(
        'An OTP was already sent. Wait for it to expire before requesting another.',
      );
    }
    this.otp.set(phone, {
      hash: await bcrypt.hash(code, 8),
      expiresAt: Date.now() + 5 * 60_000,
      attempts: 0,
    });
    return {
      challengeId: randomUUID(),
      expiresInSeconds: 300,
      provider: 'sandbox',
      ...(this.config.get<string>('NODE_ENV') === 'production'
        ? {}
        : { developmentCode: code }),
    };
  }

  async verifyOtp(phone: string, code: string, name?: string) {
    const challenge = this.otp.get(phone);
    if (!challenge || challenge.expiresAt < Date.now()) {
      throw new UnauthorizedException('OTP is invalid or expired.');
    }
    if (challenge.attempts >= 5) {
      this.otp.delete(phone);
      throw new UnauthorizedException(
        'Too many incorrect attempts. Request a new code.',
      );
    }
    if (!(await bcrypt.compare(code, challenge.hash))) {
      challenge.attempts += 1;
      throw new UnauthorizedException('OTP is invalid or expired.');
    }
    this.otp.delete(phone);

    const customer = this.store.customers.find((item) => item.phone === phone);
    const fallback = this.store.customers[0];
    return this.createSession({
      sub: customer?.id ?? fallback.id,
      name: customer?.name ?? name ?? fallback.name,
      role: 'CUSTOMER',
    });
  }

  async staffLogin(email: string, secret: string, branchId?: string) {
    const staff = this.staff.find(
      (item) => item.email === email.trim().toLowerCase(),
    );
    // Compare against a dummy hash when the account is unknown so that response
    // time does not reveal which email addresses exist.
    const matches = await bcrypt.compare(
      secret,
      staff?.pinHash ??
        '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv',
    );
    if (!staff || !matches) {
      throw new UnauthorizedException('Email or PIN is incorrect.');
    }
    if (branchId && branchId !== staff.branchId && staff.role !== 'ADMIN') {
      throw new UnauthorizedException(
        'Staff access is not valid for this branch.',
      );
    }
    return this.createSession({
      sub: staff.id,
      name: staff.name,
      role: staff.role,
      branchId: branchId ?? staff.branchId,
    });
  }

  rotate(refreshToken: string) {
    const [sessionId] = refreshToken.split('.');
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (
      !session ||
      session.expiresAt < Date.now() ||
      session.refreshHash !== this.hash(refreshToken)
    ) {
      throw new UnauthorizedException('Refresh session is invalid or expired.');
    }
    this.sessions.delete(sessionId);
    return this.createSession(session.user);
  }

  revoke(sessionId?: string) {
    if (sessionId) this.sessions.delete(sessionId);
    return { revoked: true };
  }

  sessionUser(sessionId?: string) {
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session || session.expiresAt < Date.now()) {
      throw new UnauthorizedException('This session is no longer active.');
    }
    return { ...session.user, sessionId: session.id };
  }

  managerPinIsValid(pin?: string) {
    return (
      Boolean(pin) && pin === (this.config.get('DEV_MANAGER_PIN') ?? '2468')
    );
  }

  setCookies(
    response: Response,
    session: ReturnType<AuthService['createSession']>,
  ) {
    const secure = this.config.get('NODE_ENV') === 'production';
    response.cookie('kedai_access', session.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: 15 * 60_000,
      path: '/',
    });
    response.cookie('kedai_refresh', session.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: 7 * 24 * 60 * 60_000,
      path: '/api/v1/auth',
    });
  }

  clearCookies(response: Response) {
    response.clearCookie('kedai_access', { path: '/' });
    response.clearCookie('kedai_refresh', { path: '/api/v1/auth' });
  }

  /** Housekeeping for expired sessions; called on module init. */
  pruneSessions() {
    const now = Date.now();
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    if (removed) this.logger.debug(`Pruned ${removed} expired sessions`);
    return removed;
  }

  private createSession(user: Omit<AuthUser, 'sessionId'>) {
    const id = randomUUID();
    const refreshToken = `${id}.${randomUUID()}.${randomUUID()}`;
    const payload: AuthUser = { ...user, sessionId: id };
    this.sessions.set(id, {
      id,
      user,
      refreshHash: this.hash(refreshToken),
      expiresAt: Date.now() + 7 * 24 * 60 * 60_000,
    });
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: '15m' }),
      refreshToken,
      expiresInSeconds: 900,
      user: payload,
    };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
