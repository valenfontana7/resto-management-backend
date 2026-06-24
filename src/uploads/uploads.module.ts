import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CommonModule } from '../common/common.module';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [StorageModule, CommonModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
