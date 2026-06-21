import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EdgeSyncService } from './edge-sync.service';

@Injectable()
export class EdgeSyncAuthGuard implements CanActivate {
  constructor(private readonly edgeSync: EdgeSyncService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const restaurantId = request.params?.restaurantId as string | undefined;
    if (!restaurantId) {
      throw new UnauthorizedException('Missing restaurant context');
    }

    const authHeader = String(request.headers?.authorization ?? '');
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const localId = String(request.headers?.['x-bentoo-local-id'] ?? '').trim();

    if (!token || !localId) {
      throw new UnauthorizedException('Edge sync credentials required');
    }

    const valid = await this.edgeSync.validateEdgeCredentials(
      restaurantId,
      localId,
      token,
    );
    if (!valid) {
      throw new UnauthorizedException('Invalid edge sync credentials');
    }

    request.edgeLocal = { restaurantId, localId };
    return true;
  }
}
