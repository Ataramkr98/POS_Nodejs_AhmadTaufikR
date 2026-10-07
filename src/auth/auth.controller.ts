import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Public, type AuthUser } from '../common/auth';
import {
  ManagerReauthorizeDto,
  RequestOtpDto,
  StaffLoginDto,
  VerifyOtpDto,
} from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('demo-accounts')
  @ApiOperation({ summary: 'Staff accounts available in the demo deployment' })
  demoAccounts() {
    return {
      staff: this.auth.listDemoStaff(),
      customer: {
        phone: '+6281234567890',
        otp: '111111',
        note: 'Request the code at POST /auth/customer/otp, then verify it.',
      },
    };
  }

  @Public()
  @Post('customer/otp')
  @SkipThrottle()
  @ApiOperation({ summary: 'Send a phone OTP for customer sign-in' })
  requestOtp(@Body() body: RequestOtpDto) {
    return this.auth.requestOtp(body.phone);
  }

  @Public()
  @Post('customer/verify')
  @ApiOperation({ summary: 'Verify a customer OTP and open a session' })
  async verifyOtp(
    @Body() body: VerifyOtpDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.verifyOtp(body.phone, body.code, body.name);
    this.auth.setCookies(response, session);
    return { user: session.user, expiresInSeconds: session.expiresInSeconds };
  }

  @Public()
  @Post('staff/login')
  @ApiOperation({ summary: 'Staff sign-in with email and PIN' })
  async staffLogin(
    @Body() body: StaffLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.staffLogin(
      body.email,
      body.secret,
      body.branchId,
    );
    this.auth.setCookies(response, session);
    return { user: session.user, expiresInSeconds: session.expiresInSeconds };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate an access token using the refresh cookie' })
  refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.kedai_refresh as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh cookie is missing.');
    }
    const session = this.auth.rotate(refreshToken);
    this.auth.setCookies(response, session);
    return { user: session.user, expiresInSeconds: session.expiresInSeconds };
  }

  @Get('session')
  @ApiOperation({ summary: 'The session behind the current access cookie' })
  session(@CurrentUser() user: AuthUser) {
    return this.auth.sessionUser(user.sessionId);
  }

  @Post('manager-reauthorize')
  @ApiOperation({
    summary: 'Exchange a manager PIN for a short override token',
  })
  managerReauthorize(@Body() body: ManagerReauthorizeDto) {
    if (!this.auth.managerPinIsValid(body.pin)) {
      throw new BadRequestException('Manager authorization failed.');
    }
    return {
      authorized: true,
      scope: 'manager-override',
      reason: body.reason,
      expiresInSeconds: 300,
    };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current session and clear cookies' })
  logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.auth.clearCookies(response);
    return this.auth.revoke(user.sessionId);
  }
}
