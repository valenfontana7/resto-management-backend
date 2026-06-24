import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface MaintenanceState {
  enabled: boolean;
  message: string;
}

@Injectable()
export class MaintenanceModeGuard implements CanActivate {
  private readonly cacheTtlMs = 5_000;
  private cache: { expiresAt: number; value: MaintenanceState } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = String(request?.method || '').toUpperCase();
    const path = this.normalizePath(request?.originalUrl || request?.url || '');

    if (method === 'OPTIONS') {
      return true;
    }

    if (this.isAlwaysAllowedPath(path)) {
      return true;
    }

    if (this.isMercadoPagoRootWebhookRequest(path, method, request?.query)) {
      return true;
    }

    const userRole = String(request?.user?.role || '')
      .trim()
      .toUpperCase();

    if (userRole === 'SUPER_ADMIN') {
      return true;
    }

    const state = await this.getMaintenanceState();
    if (!state.enabled) {
      return true;
    }

    if (this.isPublicReadAllowedDuringMaintenance(path, method)) {
      return true;
    }

    response?.setHeader?.('Retry-After', '120');

    throw new ServiceUnavailableException({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      error: 'Service Unavailable',
      code: 'SYSTEM_MAINTENANCE',
      message: state.message,
    });
  }

  private normalizePath(rawPath: string): string {
    const path = String(rawPath || '').toLowerCase();
    const queryIndex = path.indexOf('?');
    return queryIndex >= 0 ? path.slice(0, queryIndex) : path;
  }

  private isAlwaysAllowedPath(path: string): boolean {
    return (
      path === '/health' ||
      path === '/api/health' ||
      path === '/api/system/status' ||
      path === '/api/auth/login' ||
      path === '/api/auth/magic-link/consume' ||
      path.startsWith('/api/docs') ||
      path.startsWith('/api/webhooks') ||
      path === '/api/payments/webhook' ||
      path === '/api/mercadopago/webhook' ||
      path === '/api/mercadopago/webhooks/mercadopago' ||
      path === '/api/integrations/webhooks/delivery-platform'
    );
  }

  private isPublicReadAllowedDuringMaintenance(
    path: string,
    method: string,
  ): boolean {
    if (method !== 'GET' && method !== 'HEAD') {
      return false;
    }

    if (path === '/api/plans' || path.startsWith('/api/plans/')) {
      return true;
    }

    if (path === '/api/demo-examples') {
      return true;
    }

    if (path.startsWith('/api/public/')) {
      return true;
    }

    return false;
  }

  private isMercadoPagoRootWebhookRequest(
    path: string,
    method: string,
    query: Record<string, unknown> | undefined,
  ): boolean {
    if (method !== 'POST') {
      return false;
    }

    if (path !== '/' && path !== '') {
      return false;
    }

    const type = this.toTrimmedString(query?.type);
    const topic = this.toTrimmedString(query?.topic);
    const dataId = this.toTrimmedString(query?.['data.id']);
    const id = this.toTrimmedString(query?.id);

    return !!((type || topic) && (dataId || id));
  }

  private toTrimmedString(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    return '';
  }

  private async getMaintenanceState(): Promise<MaintenanceState> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    const settings = await this.prisma.systemSettings.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: {
        maintenanceEnabled: true,
        maintenanceMessage: true,
      },
    });

    const resolved: MaintenanceState = {
      enabled: settings?.maintenanceEnabled ?? false,
      message:
        settings?.maintenanceMessage?.trim() ||
        'El sistema esta en mantenimiento. Intenta nuevamente en unos minutos.',
    };

    this.cache = {
      value: resolved,
      expiresAt: now + this.cacheTtlMs,
    };

    return resolved;
  }
}
