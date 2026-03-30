import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreateRestrictionDto } from './dto/create-restriction.dto';
import { UpdateRestrictionDto } from './dto/update-restriction.dto';
import { Public } from '../../auth/decorators/public.decorator';

/**
 * Controlador PÚBLICO para planes de suscripción
 * Ruta base: /api/plans
 */
@Public()
@Controller('api/plans')
export class PublicPlansController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * GET /api/plans
   * Obtener planes activos disponibles (público)
   */
  @Get()
  async getAvailablePlans() {
    return this.plansService.findActive();
  }

  /**
   * GET /api/plans/:id
   * Obtener detalles de un plan específico (público)
   */
  @Get(':id')
  async getPlanDetails(@Param('id') id: string) {
    const plan = await this.plansService.findOne(id);
    if (!plan.isActive) {
      throw new NotFoundException('Plan no disponible');
    }
    return plan;
  }
}

/**
 * Controlador para gestión de planes de suscripción (ADMIN)
 * Ruta base: /api/master/plans
 */
@Controller('api/master/plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  // ============================================
  // PLANS ENDPOINTS
  // ============================================

  /**
   * GET /api/master/plans
   * Obtener todos los planes (admin)
   */
  @Get()
  async findAll() {
    return this.plansService.findAll();
  }

  /**
   * GET /api/master/plans/active
   * Obtener solo planes activos
   */
  @Get('active')
  async findActive() {
    return this.plansService.findActive();
  }

  /**
   * GET /api/master/plans/:id
   * Obtener un plan específico
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  /**
   * POST /api/master/plans
   * Crear un nuevo plan
   */
  @Post()
  async create(@Body() createPlanDto: CreatePlanDto) {
    return this.plansService.create(createPlanDto);
  }

  /**
   * PATCH /api/master/plans/:id
   * Actualizar un plan
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updatePlanDto: UpdatePlanDto) {
    return this.plansService.update(id, updatePlanDto);
  }

  /**
   * DELETE /api/master/plans/:id
   * Eliminar un plan
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.plansService.remove(id);
  }

  // ============================================
  // RESTRICTIONS ENDPOINTS
  // ============================================

  /**
   * GET /api/master/plans/:id/restrictions
   * Obtener todas las restricciones de un plan
   */
  @Get(':id/restrictions')
  async findRestrictions(@Param('id') planId: string) {
    return this.plansService.findRestrictions(planId);
  }

  /**
   * GET /api/master/plans/:id/restrictions/grouped
   * Obtener restricciones agrupadas por categoría
   */
  @Get(':id/restrictions/grouped')
  async getRestrictionsByCategory(@Param('id') planId: string) {
    return this.plansService.getRestrictionsByCategory(planId);
  }

  /**
   * POST /api/master/plans/:id/restrictions
   * Crear una restricción para un plan
   */
  @Post(':id/restrictions')
  async createRestriction(
    @Param('id') planId: string,
    @Body() createRestrictionDto: CreateRestrictionDto,
  ) {
    return this.plansService.createRestriction(planId, createRestrictionDto);
  }

  /**
   * PATCH /api/master/plans/:id/restrictions/:rid
   * Actualizar una restricción
   */
  @Patch(':id/restrictions/:rid')
  async updateRestriction(
    @Param('id') planId: string,
    @Param('rid') restrictionId: string,
    @Body() updateRestrictionDto: UpdateRestrictionDto,
  ) {
    return this.plansService.updateRestriction(
      planId,
      restrictionId,
      updateRestrictionDto,
    );
  }

  /**
   * DELETE /api/master/plans/:id/restrictions/:rid
   * Eliminar una restricción
   */
  @Delete(':id/restrictions/:rid')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRestriction(
    @Param('id') planId: string,
    @Param('rid') restrictionId: string,
  ) {
    await this.plansService.removeRestriction(planId, restrictionId);
  }
}
