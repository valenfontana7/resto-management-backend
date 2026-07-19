import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isLabRuntime } from '../../common/config/bentoo-mode.config';
import { LabEffectsPolicyService } from '../effects/lab-effects-policy.service';

export const LAB_SAFETY_ENV = 'BENTOO_LAB_SAFETY_ENV';

interface DatabaseIdentity {
  databaseName: string;
  serverAddress: string;
}

@Injectable()
export class LabSafetyService implements OnApplicationBootstrap {
  private readonly env: Record<string, string | undefined>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly effectsPolicy: LabEffectsPolicyService,
    @Optional()
    @Inject(LAB_SAFETY_ENV)
    env?: Record<string, string | undefined>,
  ) {
    this.env = env ?? process.env;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!isLabRuntime(this.env)) {
      return;
    }

    this.effectsPolicy.assertStartupPolicyComplete();
    const identities = await this.prisma.$queryRawUnsafe<DatabaseIdentity[]>(
      `SELECT current_database() AS "databaseName",
              COALESCE(inet_server_addr()::text, '') AS "serverAddress"`,
    );
    const identity = identities[0];
    const allowedDatabases = new Set(['bentoo_lab', 'bentoo_ci']);
    const allowedAddresses = new Set(['', '127.0.0.1', '::1']);
    const serverAddress = (identity?.serverAddress ?? '').split('/')[0];

    if (
      !identity ||
      !allowedDatabases.has(identity.databaseName) ||
      !allowedAddresses.has(serverAddress)
    ) {
      throw new Error(
        `Bentoo Lab requiere una base exclusiva local; conexión actual: ${
          identity?.databaseName ?? 'desconocida'
        }@${identity?.serverAddress || 'socket-local'}`,
      );
    }
  }
}
