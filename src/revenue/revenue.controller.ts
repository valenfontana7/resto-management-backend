import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CommercialRelationService } from './commercial-relation.service';
import { LogCommercialActionDto } from './dto/log-commercial-action.dto';

@ApiTags('Revenue')
@Controller('api/super-admin/revenue')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class RevenueController {
  constructor(private readonly relations: CommercialRelationService) {}

  @Get('day-queue')
  getDayQueue(@Request() req) {
    return this.relations.getDayQueue(req.user?.userId);
  }

  @Get('relations/by-lead/:leadId')
  findByLead(@Param('leadId') leadId: string, @Request() req) {
    return this.relations.findByLeadId(leadId, req.user?.userId);
  }

  @Get('relations/:id/brief')
  getBrief(@Param('id') id: string) {
    return this.relations.getBrief(id);
  }

  @Get('relations/:id/timeline')
  getTimeline(@Param('id') id: string) {
    return this.relations.getTimeline(id);
  }

  @Get('relations/:id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.relations.findById(id, req.user?.userId);
  }

  @Post('relations/:id/log')
  logAction(
    @Param('id') id: string,
    @Body() dto: LogCommercialActionDto,
    @Request() req,
  ) {
    return this.relations.logAction(id, dto, req.user?.userId);
  }

  @Post('sync-leads')
  syncLeads() {
    return this.relations.syncAllLeads();
  }
}
