import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { VerifyRestaurantAccess } from '../../common/decorators/verify-restaurant-access.decorator';
import { RestaurantBrandingV2Service } from '../services/restaurant-branding-v2.service';
import {
  UpdateBrandingV2Dto,
  BrandingThemeDto,
  NavSectionDto,
  HeroSectionDto,
  MenuSectionDto,
  CartSectionDto,
  FooterSectionDto,
  CheckoutSectionDto,
  ReservationsSectionDto,
} from '../dto/branding-v2.dto';

@ApiTags('Restaurant Branding V2')
@Controller('restaurants')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RestaurantBrandingV2Controller {
  constructor(private readonly brandingService: RestaurantBrandingV2Service) {}

  // ==================== Full Branding ====================

  @ApiOperation({
    summary: 'Get restaurant branding (V2 structure)',
    description:
      'Obtiene la configuración completa de branding con estructura V2',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @Get(':id/branding/v2')
  async getBranding(@VerifyRestaurantAccess('id') restaurantId: string) {
    const branding = await this.brandingService.getBranding(restaurantId);
    return { success: true, branding };
  }

  @ApiOperation({
    summary: 'Update restaurant branding (V2 structure)',
    description:
      'Actualiza el branding del restaurante. Soporta actualizaciones parciales con merge profundo.',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @ApiBody({ type: UpdateBrandingV2Dto })
  @Put(':id/branding/v2')
  async updateBranding(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() dto: UpdateBrandingV2Dto,
  ) {
    return this.brandingService.updateBranding(restaurantId, dto);
  }

  @ApiOperation({
    summary: 'Reset branding to defaults',
    description: 'Resetea el branding a los valores por defecto del sistema',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @Post(':id/branding/v2/reset')
  async resetBranding(@VerifyRestaurantAccess('id') restaurantId: string) {
    return this.brandingService.resetBranding(restaurantId);
  }

  @ApiOperation({
    summary: 'Migrate branding from V1 to V2',
    description: 'Migra la estructura de branding V1 a V2',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @Post(':id/branding/migrate-to-v2')
  async migrateBranding(@VerifyRestaurantAccess('id') restaurantId: string) {
    return this.brandingService.migrateFromV1(restaurantId);
  }

  // ==================== Theme ====================

  @ApiOperation({
    summary: 'Update theme configuration',
    description:
      'Actualiza solo la configuración del tema (colores, tipografía, espaciado)',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @ApiBody({ type: BrandingThemeDto })
  @Patch(':id/branding/v2/theme')
  async updateTheme(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() themeDto: BrandingThemeDto,
  ) {
    return this.brandingService.updateTheme(restaurantId, themeDto);
  }

  // ==================== Sections ====================

  @ApiOperation({
    summary: 'Update navigation section',
    description:
      'Actualiza solo la configuración de la sección de navegación/header',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @ApiBody({ type: NavSectionDto })
  @Patch(':id/branding/v2/sections/nav')
  async updateNavSection(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() navDto: NavSectionDto,
  ) {
    return this.brandingService.updateSection(restaurantId, 'nav', navDto);
  }

  @ApiOperation({
    summary: 'Update hero section',
    description: 'Actualiza solo la configuración de la sección hero/banner',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @ApiBody({ type: HeroSectionDto })
  @Patch(':id/branding/v2/sections/hero')
  async updateHeroSection(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() heroDto: HeroSectionDto,
  ) {
    return this.brandingService.updateSection(restaurantId, 'hero', heroDto);
  }

  @ApiOperation({
    summary: 'Update menu section',
    description: 'Actualiza solo la configuración de la sección del menú',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @ApiBody({ type: MenuSectionDto })
  @Patch(':id/branding/v2/sections/menu')
  async updateMenuSection(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() menuDto: MenuSectionDto,
  ) {
    return this.brandingService.updateSection(restaurantId, 'menu', menuDto);
  }

  @ApiOperation({
    summary: 'Update cart section',
    description: 'Actualiza solo la configuración del carrito',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @ApiBody({ type: CartSectionDto })
  @Patch(':id/branding/v2/sections/cart')
  async updateCartSection(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() cartDto: CartSectionDto,
  ) {
    return this.brandingService.updateSection(restaurantId, 'cart', cartDto);
  }

  @ApiOperation({
    summary: 'Update footer section',
    description: 'Actualiza solo la configuración del footer',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @ApiBody({ type: FooterSectionDto })
  @Patch(':id/branding/v2/sections/footer')
  async updateFooterSection(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() footerDto: FooterSectionDto,
  ) {
    return this.brandingService.updateSection(
      restaurantId,
      'footer',
      footerDto,
    );
  }

  @ApiOperation({
    summary: 'Update checkout section',
    description: 'Actualiza solo la configuración del checkout',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @ApiBody({ type: CheckoutSectionDto })
  @Patch(':id/branding/v2/sections/checkout')
  async updateCheckoutSection(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() checkoutDto: CheckoutSectionDto,
  ) {
    return this.brandingService.updateSection(
      restaurantId,
      'checkout',
      checkoutDto,
    );
  }

  @ApiOperation({
    summary: 'Update reservations section',
    description: 'Actualiza solo la configuración de reservaciones',
  })
  @ApiParam({ name: 'id', description: 'Restaurant ID' })
  @ApiBody({ type: ReservationsSectionDto })
  @Patch(':id/branding/v2/sections/reservations')
  async updateReservationsSection(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() reservationsDto: ReservationsSectionDto,
  ) {
    return this.brandingService.updateSection(
      restaurantId,
      'reservations',
      reservationsDto,
    );
  }
}
