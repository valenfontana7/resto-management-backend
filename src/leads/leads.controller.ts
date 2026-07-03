import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OnboardingAiQuotaService } from '../common/services/onboarding-ai-quota.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadFiltersDto } from './dto/lead-filters.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { DiscoverLeadsDto } from './dto/discover-leads.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';
import { CheckImportDuplicatesDto } from './dto/check-import-duplicates.dto';
import {
  CreateSavedSearchDto,
  UpdateSavedSearchDto,
} from './dto/saved-search.dto';
import { LeadsService } from './leads.service';
import { LeadsAiService } from './leads-ai.service';
import { LeadsSavedSearchService } from './leads-saved-search.service';
import { LeadApprovalService } from './approval/lead-approval.service';
import { UpdateLeadApprovalDto } from './dto/update-lead-approval.dto';

@ApiTags('Leads')
@Controller('api/super-admin/leads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly leadsAiService: LeadsAiService,
    private readonly savedSearchService: LeadsSavedSearchService,
    private readonly aiQuota: OnboardingAiQuotaService,
    private readonly approvalService: LeadApprovalService,
  ) {}

  @Get('stats/dashboard')
  getDashboardStats() {
    return this.leadsService.getDashboardStats();
  }

  @Get('stats/analytics')
  getAnalyticsStats() {
    return this.leadsService.getAnalyticsStats();
  }

  @Get('ai/recent')
  getRecentAnalyses() {
    return this.leadsAiService.getRecentAnalyses();
  }

  @Get('approvals/pending')
  listPendingApprovals() {
    return this.approvalService.listPending();
  }

  @Get('ai/discover/quota')
  getDiscoveryQuota(@Request() req) {
    return this.aiQuota.getUserQuotaStatus(req.user?.userId, 'discover');
  }

  @Get('ai/discovery/recent')
  getRecentDiscoveries() {
    return this.leadsAiService.getRecentDiscoveries();
  }

  @Get('ai/discovery/:sessionId')
  getDiscoverySession(@Param('sessionId') sessionId: string) {
    return this.leadsAiService.getDiscoverySession(sessionId);
  }

  @Post('ai/discover')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async discover(@Body() dto: DiscoverLeadsDto, @Request() req) {
    const userId = req.user?.userId;
    await this.aiQuota.checkUserQuota(userId, 'discover');
    const result = await this.leadsAiService.discoverProspects(dto, userId);
    if (result.status === 'success' || result.status === 'empty') {
      await this.aiQuota.incrementUserQuota(userId, 'discover');
    }
    return result;
  }

  @Post('import/check-duplicates')
  checkImportDuplicates(@Body() dto: CheckImportDuplicatesDto) {
    return this.leadsService.checkImportDuplicates(dto.candidates);
  }

  @Post('import')
  importLeads(@Body() dto: ImportLeadsDto, @Request() req) {
    return this.leadsAiService.importCandidates(
      dto,
      req.user?.userId,
      dto.postProcessMode ?? 'suggest',
    );
  }

  @Get('ai/saved-searches')
  listSavedSearches(@Request() req) {
    return this.savedSearchService.list(req.user?.userId);
  }

  @Post('ai/saved-searches')
  createSavedSearch(@Body() dto: CreateSavedSearchDto, @Request() req) {
    return this.savedSearchService.create(dto, req.user?.userId);
  }

  @Patch('ai/saved-searches/:id')
  updateSavedSearch(
    @Param('id') id: string,
    @Body() dto: UpdateSavedSearchDto,
  ) {
    return this.savedSearchService.update(id, dto);
  }

  @Delete('ai/saved-searches/:id')
  deleteSavedSearch(@Param('id') id: string) {
    return this.savedSearchService.remove(id);
  }

  @Post('ai/saved-searches/:id/run')
  async runSavedSearch(@Param('id') id: string, @Request() req) {
    const search = await this.savedSearchService.findOne(id);
    const userId = req.user?.userId;
    await this.aiQuota.checkUserQuota(userId, 'discover');

    const filters = (search.filters ?? {}) as {
      city?: string;
      category?: string;
      maxResults?: number;
    };

    const result = await this.leadsAiService.discoverProspects(
      {
        query: search.query,
        city: filters.city,
        category: filters.category,
        maxResults: filters.maxResults,
      },
      userId,
    );

    if (result.status === 'success' || result.status === 'empty') {
      await this.aiQuota.incrementUserQuota(userId, 'discover');
    }

    await this.savedSearchService.markRun(id);
    return result;
  }

  @Get()
  findAll(@Query() filters: LeadFiltersDto) {
    return this.leadsService.findAll(filters);
  }

  @Post()
  create(@Body() dto: CreateLeadDto, @Request() req) {
    return this.leadsService.create(dto, req.user?.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
    @Request() req,
  ) {
    return this.leadsService.updateStatus(id, dto.status, req.user?.userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leadsService.remove(id);
  }

  @Post(':id/ai/analyze')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  analyze(@Param('id') id: string, @Request() req) {
    return this.leadsAiService.analyzeBusiness(id, req.user?.userId);
  }

  @Post(':id/ai/message/instagram')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  messageInstagram(@Param('id') id: string, @Request() req) {
    return this.leadsAiService.generateMessage(
      id,
      'instagram',
      req.user?.userId,
    );
  }

  @Post(':id/ai/message/whatsapp')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  messageWhatsapp(@Param('id') id: string, @Request() req) {
    return this.leadsAiService.generateMessage(
      id,
      'whatsapp',
      req.user?.userId,
    );
  }

  @Post(':id/ai/message/email')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  messageEmail(@Param('id') id: string, @Request() req) {
    return this.leadsAiService.generateMessage(id, 'email', req.user?.userId);
  }

  @Get(':id/ai/analyses')
  getAnalyses(@Param('id') id: string) {
    return this.leadsAiService.getLeadAnalyses(id);
  }

  @Patch(':id/approvals/:analysisId')
  updateApproval(
    @Param('analysisId') analysisId: string,
    @Body() dto: UpdateLeadApprovalDto,
    @Request() req,
  ) {
    return this.approvalService.updateContent(
      analysisId,
      req.user?.userId,
      dto.content,
    );
  }

  @Post(':id/approvals/:analysisId/regenerate')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  regenerateApproval(@Param('analysisId') analysisId: string, @Request() req) {
    return this.approvalService.regenerate(analysisId, req.user?.userId);
  }

  @Post(':id/approvals/:analysisId/approve')
  approveAnalysis(@Param('analysisId') analysisId: string, @Request() req) {
    return this.approvalService.approve(analysisId, req.user?.userId);
  }

  @Post(':id/approvals/:analysisId/reject')
  rejectAnalysis(@Param('analysisId') analysisId: string, @Request() req) {
    return this.approvalService.reject(analysisId, req.user?.userId);
  }

  @Post(':id/approvals/:analysisId/mark-sent')
  markSent(@Param('analysisId') analysisId: string, @Request() req) {
    return this.approvalService.markSent(analysisId, req.user?.userId);
  }
}
