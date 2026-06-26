import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SalonDesktopService } from './salon-desktop.service';

@ApiTags('Salon Desktop')
@Controller('api/public/desktop')
export class SalonDesktopController {
  constructor(private readonly salonDesktop: SalonDesktopService) {}

  @Get('latest')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({
    summary: 'Última versión publicada del instalador Bentoo Salón Desktop',
  })
  async getLatestRelease() {
    return this.salonDesktop.getLatestRelease();
  }
}
