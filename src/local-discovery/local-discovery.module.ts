import { Module } from '@nestjs/common';
import { LocalDiscoveryService } from './local-discovery.service';

@Module({
  providers: [LocalDiscoveryService],
  exports: [LocalDiscoveryService],
})
export class LocalDiscoveryModule {}
