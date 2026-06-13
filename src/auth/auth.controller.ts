import { Controller, Post, Get, Body, Res, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  LoginIntentDto,
  CompletePasswordSetupDto,
  RequestMagicLinkDto,
  RegisterMagicLinkDto,
  ConsumeMagicLinkDto,
} from './dto/auth.dto';
import { ImpersonateDto } from './dto/impersonate.dto';
import { SwitchRestaurantDto } from './dto/switch-restaurant.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { RequestUser } from './decorators/current-user.decorator';
import type { Response } from 'express';

@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

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
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setAuthCookie(res, result.token);
    return result;
  }

  @Public()
  @Post('login/intent')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Resolve login mode for an email' })
  @ApiResponse({ status: 200, description: 'Login mode resolved' })
  async loginIntent(@Body() dto: LoginIntentDto) {
    return this.authService.getLoginIntent(dto);
  }

  @Public()
  @Post('magic-link/request')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Request a passwordless login link' })
  @ApiResponse({ status: 200, description: 'Magic link request accepted' })
  async requestMagicLink(@Body() dto: RequestMagicLinkDto) {
    return this.authService.requestMagicLink(dto);
  }

  @Public()
  @Post('register/magic-link')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Register a new user and send a passwordless link' })
  @ApiResponse({
    status: 200,
    description: 'Magic link sent (account created if missing)',
  })
  async registerWithMagicLink(@Body() dto: RegisterMagicLinkDto) {
    return this.authService.registerWithMagicLink(dto);
  }

  @Public()
  @Post('magic-link/consume')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Consume a passwordless login link' })
  @ApiResponse({ status: 200, description: 'Login completed' })
  async consumeMagicLink(
    @Body() dto: ConsumeMagicLinkDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.consumeMagicLink(dto);
    this.setAuthCookie(res, result.token);
    return result;
  }

  @Public()
  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setAuthCookie(res, result.token);
    return result;
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
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.completePasswordSetup(dto);
    this.setAuthCookie(res, result.token);
    return result;
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
}
