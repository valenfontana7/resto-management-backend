import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Get Hello' })
  @ApiResponse({ status: 200, description: 'Return Hello World.' })
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @ApiOperation({ summary: 'Health Check' })
  @ApiResponse({ status: 200, description: 'Service health status' })
  @Get('health')
  async healthCheck() {
    return this.appService.healthCheck();
  }

  @Public()
  @ApiOperation({ summary: 'API Health Check' })
  @ApiResponse({ status: 200, description: 'API health status' })
  @Get('api/health')
  async apiHealthCheck() {
    return this.appService.healthCheck();
  }
}
