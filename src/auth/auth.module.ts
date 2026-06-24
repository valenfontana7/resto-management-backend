import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegistrationAbuseService } from './services/registration-abuse.service';
import { AuthEmailAbuseService } from './services/auth-email-abuse.service';
import { OwnerEmailVerificationService } from './services/owner-email-verification.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PermissionsGuard } from './guards/permissions.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAlertsModule } from '../admin-alerts/admin-alerts.module';
import { EmailModule } from '../email/email.module';
import { getJwtSecret } from '../common/config/jwt.config';

@Module({
  imports: [
    PrismaModule,
    AdminAlertsModule,
    EmailModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: getJwtSecret(configService.get<string>('JWT_SECRET')),
        signOptions: {
          expiresIn: '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistrationAbuseService,
    AuthEmailAbuseService,
    OwnerEmailVerificationService,
    JwtStrategy,
    PermissionsGuard,
  ],
  exports: [
    AuthService,
    JwtStrategy,
    PassportModule,
    PermissionsGuard,
    OwnerEmailVerificationService,
    AuthEmailAbuseService,
  ],
})
export class AuthModule {}
