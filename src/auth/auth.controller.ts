import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { OwnerEmailVerificationService } from './services/owner-email-verification.service';
import { AuthEmailAbuseService } from './services/auth-email-abuse.service';
import { BotDefenseService } from '../common/services/bot-defense.service';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import {
  RegisterDto,
  LoginDto,
  LoginIntentDto,
  CompletePasswordSetupDto,
  RequestMagicLinkDto,
  RegisterMagicLinkDto,
  ConsumeMagicLinkDto,
  ChangePasswordDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  RequestEmailVerificationDto,
  ConsumeEmailVerificationDto,
  IssueDeviceTokenDto,
} from './dto/auth.dto';
import { ImpersonateDto } from './dto/impersonate.dto';
import { SwitchRestaurantDto } from './dto/switch-restaurant.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { RequestUser } from './decorators/current-user.decorator';
import type { Response, Request } from 'express';

@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly ownerEmailVerification: OwnerEmailVerificationService,
    private readonly authEmailAbuse: AuthEmailAbuseService,
    private readonly botDefense: BotDefenseService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
  ) {}

  private setAuthCookie(res: Response, token: string) {
    res.cookie('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookie(res: Response) {
    res.clearCookie('auth-token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  @Post('impersonate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Impersonate a restaurant user (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Impersonation token generated' })
  async impersonate(
    @Body() dto: ImpersonateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.authService.impersonate(dto.restaurantId, user.userId);
  }

  @Public()
  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto, {
      ip: this.getClientIp(req),
    });
    this.setAuthCookie(res, result.token);
    return result;
  }

  @Public()
  @Post('login/intent')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Resolve login mode for an email' })
  @ApiResponse({ status: 200, description: 'Login mode resolved' })
  async loginIntent(@Body() dto: LoginIntentDto, @Req() req: Request) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: this.getClientIp(req),
      scope: 'login_intent',
    });
    return this.authService.getLoginIntent(dto, {
      ip: this.getClientIp(req),
    });
  }

  @Public()
  @Post('magic-link/request')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Request a passwordless login link' })
  @ApiResponse({ status: 200, description: 'Magic link request accepted' })
  async requestMagicLink(
    @Body() dto: RequestMagicLinkDto,
    @Req() req: Request,
  ) {
    return this.authService.requestMagicLink(dto, {
      ip: this.getClientIp(req),
    });
  }

  @Public()
  @Post('register/magic-link')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Register a new user and send a passwordless link' })
  @ApiResponse({
    status: 200,
    description: 'Magic link sent (account created if missing)',
  })
  async registerWithMagicLink(
    @Body() dto: RegisterMagicLinkDto,
    @Req() req: Request,
  ) {
    return this.authService.registerWithMagicLink(dto, {
      ip: this.getClientIp(req),
    });
  }

  @Public()
  @Post('magic-link/consume')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Consume a passwordless login link' })
  @ApiResponse({ status: 200, description: 'Login completed' })
  async consumeMagicLink(
    @Body() dto: ConsumeMagicLinkDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: this.getClientIp(req),
      scope: 'token_lookup',
    });

    try {
      const result = await this.authService.consumeMagicLink(dto);
      this.setAuthCookie(res, result.token);
      return result;
    } catch (err) {
      await this.botDefense.applyBotDelayMs();
      throw err;
    }
  }

  @Public()
  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (this.botDefense.isHoneypotTriggered(dto.companyWebsite)) {
      this.botDefense.logHoneypotHit('auth.login', {
        ip: this.getClientIp(req),
        email: dto.email,
      });
      await this.botDefense.applyBotDelayMs();
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: this.getClientIp(req),
      scope: 'login_attempt',
    });

    try {
      const result = await this.authService.login(dto);
      this.setAuthCookie(res, result.token);
      return result;
    } catch (err) {
      await this.botDefense.applyBotDelayMs();
      throw err;
    }
  }

  @Public()
  @Post('password-setup')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Complete pending password setup' })
  @ApiResponse({
    status: 200,
    description: 'Password configured and login completed',
  })
  async completePasswordSetup(
    @Body() dto: CompletePasswordSetupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (this.botDefense.isHoneypotTriggered(dto.companyWebsite)) {
      this.botDefense.logHoneypotHit('auth.password-setup', {
        ip: this.getClientIp(req),
        email: dto.email,
      });
      await this.botDefense.applyBotDelayMs();
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: this.getClientIp(req),
      scope: 'activation_code',
    });

    try {
      const result = await this.authService.completePasswordSetup(dto);
      this.setAuthCookie(res, result.token);
      return result;
    } catch (err) {
      await this.botDefense.applyBotDelayMs();
      throw err;
    }
  }

  @Post('change-password')
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Change password for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Password updated successfully' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.authService.changePassword(user.userId, dto);
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Request a password reset link by email' })
  @ApiResponse({ status: 200, description: 'Reset request accepted' })
  async forgotPassword(
    @Body() dto: RequestPasswordResetDto,
    @Req() req: Request,
  ) {
    return this.authService.requestPasswordReset(dto, {
      ip: this.getClientIp(req),
    });
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Reset password using a one-time token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired reset link' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: this.getClientIp(req),
      scope: 'token_lookup',
    });

    try {
      return await this.authService.resetPassword(dto);
    } catch (err) {
      await this.botDefense.applyBotDelayMs();
      throw err;
    }
  }

  @Public()
  @Post('verify-email/consume')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Confirm owner email with one-time token' })
  async consumeEmailVerification(
    @Body() dto: ConsumeEmailVerificationDto,
    @Req() req: Request,
  ) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: this.getClientIp(req),
      scope: 'token_lookup',
    });

    try {
      return await this.ownerEmailVerification.consumeVerificationToken(
        dto.token,
      );
    } catch (err) {
      await this.botDefense.applyBotDelayMs();
      throw err;
    }
  }

  @Public()
  @Post('verify-email/request')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Resend owner email verification link' })
  async requestEmailVerification(
    @Body() dto: RequestEmailVerificationDto,
    @Req() req: Request,
  ) {
    if (this.botDefense.isHoneypotTriggered(dto.companyWebsite)) {
      this.botDefense.logHoneypotHit('auth.verify-email.request', {
        ip: this.getClientIp(req),
        email: dto.email,
      });
      await this.botDefense.applyBotDelayMs();
      return { sent: true, expiresInHours: 24 };
    }

    if (!dto.email?.trim()) {
      return { sent: true, expiresInHours: 24 };
    }

    await this.authEmailAbuse.assertEmailDeliveryAllowed({
      ip: this.getClientIp(req),
      email: dto.email,
      scope: 'email_verification',
    });

    return this.ownerEmailVerification.requestVerificationByEmail(dto.email);
  }

  @Post('verify-email/resend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Resend verification email for current user' })
  async resendEmailVerification(@CurrentUser() user: RequestUser) {
    return this.ownerEmailVerification.sendVerificationEmail(user.userId);
  }

  @Get('verify-email/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get email verification status for current user' })
  async getEmailVerificationStatus(@CurrentUser() user: RequestUser) {
    const { user: me } = await this.authService.getMe(user.userId);
    const emailVerified = this.ownerEmailVerification.isEmailVerified({
      emailVerifiedAt: me.emailVerifiedAt ?? null,
      role: me.role ? { name: me.role.name } : null,
    });
    return {
      emailVerified,
      emailVerificationRequired: !emailVerified,
    };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user' })
  @ApiResponse({ status: 200, description: 'User data retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: RequestUser) {
    return this.authService.getMe(user.userId);
  }

  @Get('restaurants')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List restaurants the current user can access/switch to',
  })
  @ApiResponse({ status: 200, description: 'Accessible restaurants retrieved' })
  async getAccessibleRestaurants(@CurrentUser() user: RequestUser) {
    return this.authService.listAccessibleRestaurants(user.userId);
  }

  @Post('switch-restaurant')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Switch the active restaurant for the current user',
  })
  @ApiResponse({ status: 200, description: 'Active restaurant switched' })
  @ApiResponse({ status: 403, description: 'No access to that restaurant' })
  async switchRestaurant(
    @Body() dto: SwitchRestaurantDto,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.switchRestaurant(
      user.userId,
      dto.restaurantId,
    );
    this.setAuthCookie(res, result.token);
    return result;
  }

  @Post('refresh')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Refresh the session token (sliding expiration)',
  })
  @ApiResponse({ status: 200, description: 'Session token refreshed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async refresh(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.createAuthResponseForUserId(
      user.userId,
    );
    this.setAuthCookie(res, result.token);
    return result;
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(@Res({ passthrough: true }) res: Response) {
    this.clearAuthCookie(res);
    return { message: 'Logout successful' };
  }

  @Post('device-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Emitir token de dispositivo (90 días) para terminal de caja',
  })
  @ApiResponse({ status: 201, description: 'Device token issued' })
  async issueDeviceToken(
    @Body() dto: IssueDeviceTokenDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.authService.issueDeviceToken(
      user.userId,
      dto.restaurantId,
      dto.terminalId,
    );
  }
}
