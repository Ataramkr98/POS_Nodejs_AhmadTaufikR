import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { UserRole } from '../generated/prisma/enums';

export const IS_PUBLIC_KEY = 'kedai:public';
export const ROLES_KEY = 'kedai:roles';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export type AuthUser = {
  sub: string;
  name: string;
  role: UserRole;
  branchId?: string;
  sessionId: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const bearer = request.header('authorization')?.replace(/^Bearer\s+/i, '');
    const token = request.cookies?.kedai_access as string | undefined;

    try {
      request.user = this.jwt.verify<AuthUser>(bearer || token || '');
      return true;
    } catch {
      throw new UnauthorizedException(
        'Sign in is required for this operation.',
      );
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    if (request.user && roles.includes(request.user.role)) return true;
    throw new ForbiddenException(
      'Your role does not have permission for this operation.',
    );
  }
}
