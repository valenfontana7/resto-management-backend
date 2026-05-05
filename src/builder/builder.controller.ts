import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { VerifyRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';
import { BuilderService } from './builder.service';
import {
  UpdateBuilderConfigDto,
  ThemeConfigDto,
  LayoutConfigDto,
  AssetsConfigDto,
  NavigationConfigDto,
  HeroConfigDto,
  MenuConfigDto,
  InfoSectionConfigDto,
  FooterConfigDto,
  CartConfigDto,
  MobileMenuConfigDto,
  SEOConfigDto,
  AdvancedConfigDto,
  BuilderConfigEnvelopeDto,
} from './dto/builder-config.dto';

@ApiTags('Builder')
@Controller('api/restaurants/:restaurantId/builder')
@UseGuards(PermissionsGuard)
@Permissions('branding')
export class BuilderController {
  constructor(private readonly builderService: BuilderService) {}

  // ==================== MAIN CONFIG ENDPOINTS ====================

  @Get('config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get builder configuration' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Configuration retrieved successfully',
    type: BuilderConfigEnvelopeDto,
  })
  @ApiResponse({ status: 404, description: 'Restaurant not found' })
  async getConfig(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
  ) {
    const config = await this.builderService.getConfig(restaurantId);
    return {
      success: true,
      data: config,
    };
  }

  @Patch('config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update builder configuration (partial update with deep merge)',
  })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Configuration updated successfully',
    type: BuilderConfigEnvelopeDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid configuration' })
  @ApiResponse({ status: 404, description: 'Restaurant not found' })
  async updateConfig(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() updates: UpdateBuilderConfigDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const config = await this.builderService.updateConfig(
      restaurantId,
      updates,
      userId,
    );
    return {
      success: true,
      data: config,
    };
  }

  @Put('config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Replace entire builder configuration' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Configuration replaced successfully',
    type: BuilderConfigEnvelopeDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid configuration' })
  @ApiResponse({ status: 404, description: 'Restaurant not found' })
  async replaceConfig(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() config: UpdateBuilderConfigDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    const newConfig = await this.builderService.replaceConfig(
      restaurantId,
      config as any,
      userId,
    );
    return {
      success: true,
      data: newConfig,
    };
  }

  // ==================== PUBLISH ENDPOINTS ====================

  @Post('publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish builder configuration' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Configuration published successfully',
  })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async publishConfig(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
  ) {
    await this.builderService.publishConfig(restaurantId);
    return {
      success: true,
      message: 'Configuration published successfully',
    };
  }

  @Post('unpublish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpublish builder configuration' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Configuration unpublished successfully',
  })
  async unpublishConfig(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
  ) {
    await this.builderService.unpublishConfig(restaurantId);
    return {
      success: true,
      message: 'Configuration unpublished successfully',
    };
  }

  // ==================== RESET ENDPOINT ====================

  @Post('reset')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset builder configuration to defaults' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({ status: 200, description: 'Configuration reset successfully' })
  async resetConfig(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
  ) {
    const config = await this.builderService.resetConfig(restaurantId);
    return {
      success: true,
      message: 'Configuration reset to defaults',
      data: config,
    };
  }

  // ==================== METADATA ENDPOINT ====================

  @Get('metadata')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get builder configuration metadata' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({ status: 200, description: 'Metadata retrieved successfully' })
  async getMetadata(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
  ) {
    const metadata = await this.builderService.getConfigMetadata(restaurantId);
    return {
      success: true,
      data: metadata,
    };
  }

  // ==================== GRANULAR UPDATE ENDPOINTS ====================

  @Patch('theme')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update theme configuration only' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({ status: 200, description: 'Theme updated successfully' })
  async updateTheme(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() theme: ThemeConfigDto,
  ) {
    const data = await this.builderService.updateTheme(restaurantId, theme);
    return {
      success: true,
      data,
    };
  }

  @Patch('layout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update layout configuration only' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({ status: 200, description: 'Layout updated successfully' })
  async updateLayout(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() layout: LayoutConfigDto,
  ) {
    const data = await this.builderService.updateLayout(restaurantId, layout);
    return {
      success: true,
      data,
    };
  }

  @Patch('assets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update assets configuration only' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({ status: 200, description: 'Assets updated successfully' })
  async updateAssets(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() assets: AssetsConfigDto,
  ) {
    const data = await this.builderService.updateAssets(restaurantId, assets);
    return {
      success: true,
      data,
    };
  }

  @Patch('mobile-menu')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update mobile menu configuration only' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({ status: 200, description: 'Mobile menu updated successfully' })
  async updateMobileMenu(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() mobileMenu: MobileMenuConfigDto,
  ) {
    const data = await this.builderService.updateMobileMenu(
      restaurantId,
      mobileMenu,
    );
    return {
      success: true,
      data,
    };
  }

  @Patch('seo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update SEO configuration only' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({ status: 200, description: 'SEO updated successfully' })
  async updateSEO(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() seo: SEOConfigDto,
  ) {
    const data = await this.builderService.updateSEO(restaurantId, seo);
    return {
      success: true,
      data,
    };
  }

  @Patch('advanced')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update advanced configuration only' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Advanced settings updated successfully',
  })
  async updateAdvanced(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() advanced: AdvancedConfigDto,
  ) {
    const data = await this.builderService.updateAdvanced(
      restaurantId,
      advanced,
    );
    return {
      success: true,
      data,
    };
  }

  // ==================== SECTION UPDATE ENDPOINTS ====================

  @Patch('sections/nav')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update navigation section configuration' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Navigation section updated successfully',
  })
  async updateNavSection(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() config: NavigationConfigDto,
  ) {
    const data = await this.builderService.updateSection(
      restaurantId,
      'nav',
      config,
    );
    return {
      success: true,
      section: 'nav',
      data,
    };
  }

  @Patch('sections/hero')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update hero section configuration' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Hero section updated successfully',
  })
  async updateHeroSection(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() config: HeroConfigDto,
  ) {
    const data = await this.builderService.updateSection(
      restaurantId,
      'hero',
      config,
    );
    return {
      success: true,
      section: 'hero',
      data,
    };
  }

  @Patch('sections/menu')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update menu section configuration' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Menu section updated successfully',
  })
  async updateMenuSection(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() config: MenuConfigDto,
  ) {
    const data = await this.builderService.updateSection(
      restaurantId,
      'menu',
      config,
    );
    return {
      success: true,
      section: 'menu',
      data,
    };
  }

  @Patch('sections/info')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update info section configuration' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Info section updated successfully',
  })
  async updateInfoSection(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() config: InfoSectionConfigDto,
  ) {
    const data = await this.builderService.updateSection(
      restaurantId,
      'info',
      config,
    );
    return {
      success: true,
      section: 'info',
      data,
    };
  }

  @Patch('sections/footer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update footer section configuration' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Footer section updated successfully',
  })
  async updateFooterSection(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() config: FooterConfigDto,
  ) {
    const data = await this.builderService.updateSection(
      restaurantId,
      'footer',
      config,
    );
    return {
      success: true,
      section: 'footer',
      data,
    };
  }

  @Patch('sections/cart')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update cart section configuration' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({
    status: 200,
    description: 'Cart section updated successfully',
  })
  async updateCartSection(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() config: CartConfigDto,
  ) {
    const data = await this.builderService.updateSection(
      restaurantId,
      'cart',
      config,
    );
    return {
      success: true,
      section: 'cart',
      data,
    };
  }

  // ==================== GENERIC SECTION UPDATE ====================

  @Patch('sections/:sectionName')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update any section configuration' })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiParam({
    name: 'sectionName',
    description:
      'Section name (nav, hero, menu, info, footer, cart, checkout, orderConfirmation, reservations)',
  })
  @ApiResponse({ status: 200, description: 'Section updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid section name' })
  async updateSection(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('sectionName') sectionName: string,
    @Body() config: any,
  ) {
    const data = await this.builderService.updateSection(
      restaurantId,
      sectionName,
      config,
    );
    return {
      success: true,
      section: sectionName,
      data,
    };
  }

  // ==================== MIGRATION ENDPOINT ====================

  @Post('migrate-from-branding')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Migrate from old branding format to new builder config',
  })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant ID' })
  @ApiResponse({ status: 200, description: 'Migration completed successfully' })
  async migrateFromBranding(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
  ) {
    const config = await this.builderService.migrateFromBranding(restaurantId);
    return {
      success: true,
      message: 'Migration from branding to builder config completed',
      data: config,
    };
  }
}
