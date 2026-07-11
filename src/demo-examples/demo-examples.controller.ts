import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BundleValidationError } from '../prospect-importer/prospect-importer.service';
import type { ProspectBundle } from '../prospect-importer/types';
import { CreateDemoExampleDto } from './dto/create-demo-example.dto';
import { ImportProspectBundleDto } from './dto/import-prospect-bundle.dto';
import { UpdateDemoExampleDto } from './dto/update-demo-example.dto';
import { DemoExamplesService } from './demo-examples.service';
import { DemoActivationService } from './demo-activation.service';

@Public()
@Controller('api/demo-examples')
export class PublicDemoExamplesController {
  constructor(
    private readonly demoExamplesService: DemoExamplesService,
    private readonly demoActivationService: DemoActivationService,
  ) {}

  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async findPublic() {
    return this.demoExamplesService.findPublic();
  }

  /** Acceso por link directo (incluye demos privadas de leads, no listadas). */
  @Get('by-slug/:slug')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async findBySlug(@Param('slug') slug: string) {
    return this.demoExamplesService.findBySlug(slug);
  }

  /** Seed de onboarding para activar una demo personalizada al registrarse. */
  @Get('by-slug/:slug/onboarding-seed')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async getOnboardingSeed(@Param('slug') slug: string) {
    return this.demoActivationService.buildOnboardingSeed(slug);
  }
}

@Controller('api/master/demo-examples')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class MasterDemoExamplesController {
  constructor(private readonly demoExamplesService: DemoExamplesService) {}

  @Get()
  async findAll() {
    return this.demoExamplesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.demoExamplesService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateDemoExampleDto, @Request() req) {
    return this.demoExamplesService.create(dto, req.user?.userId);
  }

  @Post('import-prospect-bundle')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async importProspectBundle(
    @Body() dto: ImportProspectBundleDto,
    @Request() req,
  ) {
    try {
      this.demoExamplesService.assertProspectBundle(dto.bundle);
      return await this.demoExamplesService.importProspectBundle(
        dto.bundle as unknown as ProspectBundle,
        {
          dryRun: dto.dryRun ?? false,
          importedBy: req.user?.userId,
          leadId: dto.leadId,
        },
      );
    } catch (error) {
      if (error instanceof BundleValidationError) {
        throw new BadRequestException({
          message: 'El bundle no pasó la validación',
          errors: error.validationErrors,
        });
      }
      throw error;
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDemoExampleDto,
    @Request() req,
  ) {
    return this.demoExamplesService.update(id, dto, req.user?.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Request() req) {
    await this.demoExamplesService.remove(id, req.user?.userId);
  }
}
