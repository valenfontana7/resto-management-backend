import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSocket, Socket } from 'dgram';
import { isLocalMode } from '../common/config/bentoo-mode.config';
import { buildLocalServerAdvertisedUrl } from './lan-ip.util';
import {
  BENTOO_DISCOVERY_PORT,
  buildDiscoveryResponse,
  parseDiscoveryRequest,
} from './local-discovery.constants';

@Injectable()
export class LocalDiscoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocalDiscoveryService.name);
  private socket: Socket | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!isLocalMode()) return;
    if (this.config.get<string>('BENTOO_DISCOVERY') === 'false') return;

    const port = this.resolveDiscoveryPort();
    this.startUdpListener(port);
  }

  onModuleDestroy(): void {
    this.stopUdpListener();
  }

  getAdvertisedServerUrl(): string {
    const httpPort = this.resolveHttpPort();
    const explicitHost = this.config.get<string>('BENTOO_DISCOVERY_HOST');
    return buildLocalServerAdvertisedUrl(httpPort, explicitHost);
  }

  private resolveHttpPort(): number {
    const raw = this.config.get<string>('PORT') ?? '4000';
    const port = Number.parseInt(raw, 10);
    return Number.isInteger(port) && port > 0 ? port : 4000;
  }

  private resolveDiscoveryPort(): number {
    const raw =
      this.config.get<string>('BENTOO_DISCOVERY_PORT') ??
      String(BENTOO_DISCOVERY_PORT);
    const port = Number.parseInt(raw, 10);
    return Number.isInteger(port) && port > 0 ? port : BENTOO_DISCOVERY_PORT;
  }

  private startUdpListener(port: number): void {
    try {
      const socket = createSocket({ type: 'udp4', reuseAddr: true });
      this.socket = socket;

      socket.on('message', (msg, rinfo) => {
        if (!parseDiscoveryRequest(msg)) return;

        const response = buildDiscoveryResponse(this.getAdvertisedServerUrl());
        socket.send(response, 0, response.length, rinfo.port, rinfo.address);
        this.logger.debug(
          `Discovery reply → ${rinfo.address}:${rinfo.port} (${response.toString('utf8')})`,
        );
      });

      socket.on('error', (err) => {
        this.logger.error(`UDP discovery error: ${err.message}`);
      });

      socket.bind(port, '0.0.0.0', () => {
        this.logger.log(
          `LAN discovery listening on UDP :${port} → ${this.getAdvertisedServerUrl()}`,
        );
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not start LAN discovery: ${message}`);
    }
  }

  private stopUdpListener(): void {
    if (!this.socket) return;
    try {
      this.socket.close();
    } catch {
      // ignore shutdown races
    }
    this.socket = null;
  }
}
