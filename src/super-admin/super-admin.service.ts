import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminRestaurantsService } from './services/super-admin-restaurants.service';
import { SuperAdminUsersService } from './services/super-admin-users.service';
import { SuperAdminOrdersService } from './services/super-admin-orders.service';
import { SuperAdminSubscriptionsService } from './services/super-admin-subscriptions.service';
import { UpdateRestaurantStatusDto } from './dto/update-restaurant-status.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);

  constructor(
    private prisma: PrismaService,
    private restaurants: SuperAdminRestaurantsService,
    private users: SuperAdminUsersService,
    private orders: SuperAdminOrdersService,
    private subscriptions: SuperAdminSubscriptionsService,
  ) {
    void this.ensureSuperAdminRole();
  }

  private async ensureSuperAdminRole() {
    try {
      const superAdminRole = await this.prisma.role.findFirst({
        where: { name: 'SUPER_ADMIN', restaurantId: null },
      });

      if (!superAdminRole) {
        await this.prisma.role.create({
          data: {
            name: 'SUPER_ADMIN',
            permissions: ['all', 'super_admin'],
            color: '#000000',
            isSystemRole: true,
            restaurantId: null,
          },
        });
        this.logger.log('SUPER_ADMIN role created automatically');
      }
    } catch (error) {
      this.logger.error(
        'Failed to create SUPER_ADMIN role',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // ============================================
  // RESTAURANT MANAGEMENT (delegated)
  // ============================================

  getRestaurants(
    page?: number,
    limit?: number,
    search?: string,
    status?: string,
    plan?: string,
    cuisine?: string,
    include?: string,
  ) {
    return this.restaurants.getRestaurants(
      page,
      limit,
      search,
      status,
      plan,
      cuisine,
      include,
    );
  }

  getRestaurantDetails(id: string) {
    return this.restaurants.getRestaurantDetails(id);
  }

  updateRestaurant(id: string, dto: UpdateRestaurantDto, adminId: string) {
    return this.restaurants.updateRestaurant(id, dto, adminId);
  }

  updateRestaurantStatus(
    id: string,
    dto: UpdateRestaurantStatusDto,
    adminId: string,
  ) {
    return this.restaurants.updateRestaurantStatus(id, dto, adminId);
  }

  deleteRestaurant(id: string, adminId: string) {
    return this.restaurants.deleteRestaurant(id, adminId);
  }

  createRestaurant(dto: CreateRestaurantDto) {
    return this.restaurants.createRestaurant(dto);
  }

  impersonate(restaurantId: string, adminId: string) {
    return this.restaurants.impersonate(restaurantId, adminId);
  }

  getGlobalStats() {
    return this.restaurants.getGlobalStats();
  }

  // ============================================
  // USER MANAGEMENT (delegated)
  // ============================================

  getUsers(
    search?: string,
    role?: string,
    isActive?: string,
    limit?: number,
    offset?: number,
  ) {
    return this.users.getUsers(search, role, isActive, limit, offset);
  }

  createUser(dto: CreateUserDto, adminId: string) {
    return this.users.createUser(dto, adminId);
  }

  updateUser(userId: string, dto: UpdateUserDto, adminId: string) {
    return this.users.updateUser(userId, dto, adminId);
  }

  getRoles() {
    return this.users.getRoles();
  }

  // ============================================
  // ORDER MANAGEMENT (delegated)
  // ============================================

  getRestaurantOrders(
    restaurantId: string,
    page?: number,
    limit?: number,
    status?: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    return this.orders.getRestaurantOrders(
      restaurantId,
      page,
      limit,
      status,
      dateFrom,
      dateTo,
    );
  }

  createManualOrder(
    restaurantId: string,
    createOrderDto: any,
    adminId: string,
  ) {
    return this.orders.createManualOrder(restaurantId, createOrderDto, adminId);
  }

  // ============================================
  // SUBSCRIPTION MANAGEMENT (delegated)
  // ============================================

  updateSubscription(
    restaurantId: string,
    dto: UpdateSubscriptionDto,
    adminId: string,
  ) {
    return this.subscriptions.updateSubscription(restaurantId, dto, adminId);
  }

  changePlan(restaurantId: string, planId: string, adminId: string) {
    return this.subscriptions.changePlan(restaurantId, planId, adminId);
  }

  cancelSubscription(restaurantId: string, reason?: string, adminId?: string) {
    return this.subscriptions.cancelSubscription(restaurantId, reason, adminId);
  }

  reactivateSubscription(
    restaurantId: string,
    planId?: string,
    adminId?: string,
  ) {
    return this.subscriptions.reactivateSubscription(
      restaurantId,
      planId,
      adminId,
    );
  }

  toggleTrial(restaurantId: string, enableTrial: boolean, adminId?: string) {
    return this.subscriptions.toggleTrial(restaurantId, enableTrial, adminId);
  }

  updateBillingControls(restaurantId: string, dto: any, adminId?: string) {
    return this.subscriptions.updateBillingControls(restaurantId, dto, adminId);
  }

  // ============================================
  // SYSTEM SETTINGS
  // ============================================

  async getSettings() {
    let settings = await this.prisma.systemSettings.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!settings) {
      settings = await this.prisma.systemSettings.create({
        data: {},
      });
    }

    return {
      platformName: settings.platformName,
      supportEmail: settings.supportEmail,
      sessionTimeout: settings.sessionTimeout,
      notifications: {
        newRegistrations: settings.notifyNewRegistrations,
        paymentAlerts: settings.notifyPaymentAlerts,
        dailySummary: settings.notifyDailySummary,
      },
      webhooks: {
        enabled: settings.webhookEnabled,
        url: settings.webhookUrl || '',
      },
      maintenance: {
        enabled: settings.maintenanceEnabled,
        message: settings.maintenanceMessage || '',
      },
    };
  }

  async updateSettings(dto: any, adminId: string) {
    if (dto.sessionTimeout !== undefined && dto.sessionTimeout < 1) {
      throw new BadRequestException('El timeout de sesión debe ser mayor a 0');
    }

    if (dto.supportEmail && !dto.supportEmail.includes('@')) {
      throw new BadRequestException('El email de soporte no es válido');
    }

    if (dto.webhooks?.enabled && !dto.webhooks?.url) {
      throw new BadRequestException(
        'La URL del webhook es requerida cuando está habilitado',
      );
    }

    let settings = await this.prisma.systemSettings.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    const updateData: any = {
      updatedBy: adminId,
    };

    if (dto.platformName !== undefined) {
      updateData.platformName = dto.platformName;
    }

    if (dto.supportEmail !== undefined) {
      updateData.supportEmail = dto.supportEmail;
    }

    if (dto.sessionTimeout !== undefined) {
      updateData.sessionTimeout = dto.sessionTimeout;
    }

    if (dto.notifications) {
      if (dto.notifications.newRegistrations !== undefined) {
        updateData.notifyNewRegistrations = dto.notifications.newRegistrations;
      }
      if (dto.notifications.paymentAlerts !== undefined) {
        updateData.notifyPaymentAlerts = dto.notifications.paymentAlerts;
      }
      if (dto.notifications.dailySummary !== undefined) {
        updateData.notifyDailySummary = dto.notifications.dailySummary;
      }
    }

    if (dto.webhooks) {
      if (dto.webhooks.enabled !== undefined) {
        updateData.webhookEnabled = dto.webhooks.enabled;
      }
      if (dto.webhooks.url !== undefined) {
        updateData.webhookUrl = dto.webhooks.url;
      }
    }

    if (dto.maintenance) {
      if (dto.maintenance.enabled !== undefined) {
        updateData.maintenanceEnabled = dto.maintenance.enabled;
      }
      if (dto.maintenance.message !== undefined) {
        updateData.maintenanceMessage = dto.maintenance.message;
      }
    }

    if (settings) {
      settings = await this.prisma.systemSettings.update({
        where: { id: settings.id },
        data: updateData,
      });
    } else {
      settings = await this.prisma.systemSettings.create({
        data: updateData,
      });
    }

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'UPDATE_SYSTEM_SETTINGS',
        targetRestaurantId: null,
        details: {
          changes: updateData,
        },
      },
    });

    return {
      success: true,
      message: 'Configuración actualizada correctamente',
      settings: {
        platformName: settings.platformName,
        supportEmail: settings.supportEmail,
        sessionTimeout: settings.sessionTimeout,
        notifications: {
          newRegistrations: settings.notifyNewRegistrations,
          paymentAlerts: settings.notifyPaymentAlerts,
          dailySummary: settings.notifyDailySummary,
        },
        webhooks: {
          enabled: settings.webhookEnabled,
          url: settings.webhookUrl || '',
        },
        maintenance: {
          enabled: settings.maintenanceEnabled,
          message: settings.maintenanceMessage || '',
        },
      },
    };
  }
}
