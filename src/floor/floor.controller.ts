import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { TableSessionService } from './services/table-session.service';
import { CashRegisterService } from './services/cash-register.service';
import { FiscalDocumentService } from './services/fiscal-document.service';
import {
  AddSessionItemsDto,
  CloseTableSessionDto,
  OpenTableSessionDto,
  SendToKitchenDto,
  VoidTableSessionDto,
} from './dto/table-session.dto';
import { TerminalService } from './services/terminal.service';
import {
  CloseCashRegisterDto,
  CreateCashMovementDto,
  OpenCashRegisterDto,
} from './dto/cash-register.dto';
import {
  CreateTerminalDto,
  UpdateTerminalDto,
  PingTerminalDto,
} from './dto/terminal.dto';
import { UploadAfipCertificateDto } from '../fiscal/dto/upload-afip-certificate.dto';
import { DailyOperationService } from './services/daily-operation.service';
import { UpdateDailyOperationDto } from './dto/daily-operation.dto';
import { CloseDailyOperationDto } from './dto/close-daily-operation.dto';
import {
  CloseMainCashRegisterDto,
  CreateMainCashMovementDto,
  OpenMainCashRegisterDto,
} from './dto/main-cash-register.dto';
import { MainCashRegisterService } from './services/main-cash-register.service';
import { FloorIdempotencyService } from './services/floor-idempotency.service';
import { QuickAddSalonStaffDto } from './dto/salon-staff.dto';
import {
  AddSalonDeliveryItemsDto,
  CreateSalonDeliveryOrderDto,
  UpdateSalonDeliveryOrderDto,
} from './dto/salon-delivery-order.dto';
import { RestaurantUsersService } from '../restaurants/services/restaurant-users.service';
import { SalonDeliveryOrderService } from './services/salon-delivery-order.service';
import { FloorDesktopBootstrapService } from './services/floor-desktop-bootstrap.service';
import { VerifyRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';

@ApiTags('floor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/restaurants/:restaurantId/floor')
export class FloorController {
  constructor(
    private readonly tableSessions: TableSessionService,
    private readonly cashRegister: CashRegisterService,
    private readonly fiscalDocuments: FiscalDocumentService,
    private readonly terminals: TerminalService,
    private readonly dailyOperations: DailyOperationService,
    private readonly mainCashRegister: MainCashRegisterService,
    private readonly idempotency: FloorIdempotencyService,
    private readonly restaurantUsers: RestaurantUsersService,
    private readonly salonDeliveryOrders: SalonDeliveryOrderService,
    private readonly desktopBootstrap: FloorDesktopBootstrapService,
  ) {}

  // ─── Bootstrap desktop (un round-trip) ─────────────────────────────────────

  @Get('desktop-bootstrap')
  @ApiOperation({ summary: 'Snapshot inicial para Bentoo Salón Desktop' })
  getDesktopBootstrap(
    @Param('restaurantId') restaurantId: string,
    @Query('ordersLimit') ordersLimit: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    const parsed = ordersLimit != null ? parseInt(ordersLimit, 10) : 120;
    const limit = Number.isFinite(parsed) ? parsed : 120;
    return this.desktopBootstrap.getBootstrap(restaurantId, user.userId, limit);
  }

  // ─── Cuentas de mesa ───────────────────────────────────────────────────────

  @Get('sessions')
  @ApiOperation({ summary: 'Listar cuentas abiertas del salón' })
  listSessions(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tableSessions.listActive(restaurantId, user.userId);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Obtener cuenta de mesa' })
  getSession(
    @Param('restaurantId') restaurantId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tableSessions.getById(restaurantId, sessionId, user.userId);
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Abrir cuenta en mesa' })
  openSession(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: OpenTableSessionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'OPEN_SESSION',
      () => this.tableSessions.open(restaurantId, user.userId, dto, user.email),
    );
  }

  @Post('sessions/:sessionId/items')
  @ApiOperation({ summary: 'Agregar ítems a la cuenta' })
  addItems(
    @Param('restaurantId') restaurantId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: AddSessionItemsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'ADD_ITEMS',
      () =>
        this.tableSessions.addItems(restaurantId, sessionId, user.userId, dto),
    );
  }

  @Post('sessions/:sessionId/send-kitchen')
  @ApiOperation({ summary: 'Enviar comanda a cocina' })
  sendToKitchen(
    @Param('restaurantId') restaurantId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendToKitchenDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'SEND_KITCHEN',
      () =>
        this.tableSessions.sendToKitchen(
          restaurantId,
          sessionId,
          user.userId,
          dto,
        ),
    );
  }

  @Get('sessions/:sessionId/close-preview')
  @ApiOperation({
    summary: 'Vista previa de cobro (descuentos por medio de pago)',
  })
  previewClose(
    @Param('restaurantId') restaurantId: string,
    @Param('sessionId') sessionId: string,
    @Query('paymentMethod') paymentMethod: string,
    @Query('itemIds') itemIds: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    const parsedItemIds = itemIds
      ? itemIds
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;
    return this.tableSessions.previewClose(
      restaurantId,
      sessionId,
      user.userId,
      paymentMethod,
      parsedItemIds,
    );
  }

  @Post('sessions/:sessionId/close')
  @ApiOperation({ summary: 'Cobrar y cerrar cuenta' })
  closeSession(
    @Param('restaurantId') restaurantId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: CloseTableSessionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'CLOSE_SESSION',
      () =>
        this.tableSessions.close(
          restaurantId,
          sessionId,
          user.userId,
          dto,
          user.email,
        ),
    );
  }

  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: 'Cancelar cuenta abierta (sin ítems enviados)' })
  cancelSession(
    @Param('restaurantId') restaurantId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tableSessions.cancel(restaurantId, sessionId, user.userId);
  }

  @Post('sessions/:sessionId/void')
  @ApiOperation({
    summary:
      'Liberar mesa sin cobrar (anula cuenta, cancela comandas en cocina)',
  })
  voidSession(
    @Param('restaurantId') restaurantId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: VoidTableSessionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'VOID_SESSION',
      () =>
        this.tableSessions.voidSession(
          restaurantId,
          sessionId,
          user.userId,
          dto,
        ),
    );
  }

  // ─── Caja ──────────────────────────────────────────────────────────────────

  @Get('cash-register/current')
  @ApiOperation({ summary: 'Obtener caja abierta' })
  getCashRegister(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.cashRegister.getOpenSession(restaurantId, user.userId);
  }

  @Post('cash-register/open')
  @ApiOperation({ summary: 'Abrir caja parcial' })
  openCashRegister(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: OpenCashRegisterDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'OPEN_CASH_REGISTER',
      () => this.cashRegister.open(restaurantId, user.userId, user.email, dto),
    );
  }

  @Post('cash-register/close')
  @ApiOperation({ summary: 'Cerrar caja parcial con arqueo' })
  closeCashRegister(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CloseCashRegisterDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.idempotency.run(
      restaurantId,
      dto.clientMutationId,
      'CLOSE_CASH_REGISTER',
      () => this.cashRegister.close(restaurantId, user.userId, user.email, dto),
    );
  }

  @Get('cash-register/sessions/:sessionId/close-report')
  @ApiOperation({ summary: 'Comprobante de cierre de caja parcial' })
  getCashRegisterCloseReport(
    @Param('restaurantId') restaurantId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.cashRegister.getCloseReport(
      restaurantId,
      user.userId,
      sessionId,
    );
  }

  @Post('cash-register/movements')
  @ApiOperation({ summary: 'Registrar retiro/depósito manual' })
  addCashMovement(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateCashMovementDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.cashRegister.addMovement(
      restaurantId,
      user.userId,
      user.email,
      dto,
    );
  }

  @Get('cash-register/history')
  @ApiOperation({ summary: 'Historial de cajas parciales cerradas' })
  listCashRegisterHistory(
    @Param('restaurantId') restaurantId: string,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.cashRegister.listHistory(
      restaurantId,
      user.userId,
      limit ? Number(limit) : 10,
    );
  }

  // ─── Caja mayor ────────────────────────────────────────────────────────────

  @Get('cash-register/main/current')
  @ApiOperation({ summary: 'Caja mayor abierta' })
  getMainCashRegister(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.mainCashRegister.getOpenSession(restaurantId, user.userId);
  }

  @Post('cash-register/main/open')
  @ApiOperation({ summary: 'Abrir caja mayor (dueño/gerente)' })
  openMainCashRegister(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: OpenMainCashRegisterDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.mainCashRegister.open(
      restaurantId,
      user.userId,
      user.email,
      dto,
    );
  }

  @Post('cash-register/main/close')
  @ApiOperation({ summary: 'Cerrar caja mayor con arqueo' })
  closeMainCashRegister(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CloseMainCashRegisterDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.mainCashRegister.close(
      restaurantId,
      user.userId,
      user.email,
      dto,
    );
  }

  @Post('cash-register/main/movements')
  @ApiOperation({ summary: 'Depósito o retiro en caja mayor' })
  addMainCashMovement(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateMainCashMovementDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.mainCashRegister.addMovement(
      restaurantId,
      user.userId,
      user.email,
      dto,
    );
  }

  @Get('cash-register/main/history')
  @ApiOperation({ summary: 'Historial de cierres de caja mayor' })
  listMainCashHistory(
    @Param('restaurantId') restaurantId: string,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.mainCashRegister.listHistory(
      restaurantId,
      user.userId,
      limit ? Number(limit) : 10,
    );
  }

  @Get('cash-register/main/sessions/:sessionId/close-report')
  @ApiOperation({ summary: 'Comprobante de cierre de caja mayor' })
  getMainCashCloseReport(
    @Param('restaurantId') restaurantId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.mainCashRegister.getCloseReport(
      restaurantId,
      user.userId,
      sessionId,
    );
  }

  // ─── Operación del día ─────────────────────────────────────────────────────

  @Get('daily-operation')
  @ApiOperation({ summary: 'Estado de apertura/cierre del día' })
  getDailyOperation(
    @Param('restaurantId') restaurantId: string,
    @Query('date') date: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dailyOperations.getDailyOperation(
      restaurantId,
      user.userId,
      date,
    );
  }

  @Patch('daily-operation')
  @ApiOperation({ summary: 'Actualizar checklist de apertura/cierre' })
  updateDailyOperation(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: UpdateDailyOperationDto,
    @Query('date') date: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dailyOperations.updateDailyOperation(
      restaurantId,
      user.userId,
      dto,
      date,
    );
  }

  @Post('daily-operation/close-day')
  @ApiOperation({ summary: 'Cerrar caja diaria e imprimir comprobante' })
  closeDailyOperation(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CloseDailyOperationDto,
    @Query('date') date: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dailyOperations.closeDay(
      restaurantId,
      user.userId,
      user.email,
      dto,
      date,
    );
  }

  @Get('daily-operation/close-report')
  @ApiOperation({ summary: 'Comprobante de cierre de caja diaria' })
  getDailyCloseReport(
    @Param('restaurantId') restaurantId: string,
    @Query('date') date: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dailyOperations.getDailyCloseReport(
      restaurantId,
      user.userId,
      date,
    );
  }

  // ─── Terminales ────────────────────────────────────────────────────────────

  @Get('terminals')
  @ApiOperation({ summary: 'Listar terminales del restaurante' })
  listTerminals(
    @Param('restaurantId') restaurantId: string,
    @Query('includeInactive') includeInactive: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.terminals.list(
      restaurantId,
      user.userId,
      includeInactive === 'true',
    );
  }

  @Post('terminals')
  @ApiOperation({ summary: 'Registrar terminal (PC/tablet del local)' })
  createTerminal(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateTerminalDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.terminals.create(restaurantId, user.userId, dto);
  }

  @Patch('terminals/:terminalId')
  @ApiOperation({ summary: 'Actualizar terminal' })
  updateTerminal(
    @Param('restaurantId') restaurantId: string,
    @Param('terminalId') terminalId: string,
    @Body() dto: UpdateTerminalDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.terminals.update(restaurantId, terminalId, user.userId, dto);
  }

  @Post('terminals/:terminalId/ping')
  @ApiOperation({ summary: 'Heartbeat de terminal activa' })
  pingTerminal(
    @Param('restaurantId') restaurantId: string,
    @Param('terminalId') terminalId: string,
    @Body() dto: PingTerminalDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.terminals.ping(restaurantId, terminalId, user.userId, dto);
  }

  @Delete('terminals/:terminalId')
  @ApiOperation({ summary: 'Desactivar terminal' })
  deactivateTerminal(
    @Param('restaurantId') restaurantId: string,
    @Param('terminalId') terminalId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.terminals.deactivate(restaurantId, terminalId, user.userId);
  }

  // ─── Fiscal ────────────────────────────────────────────────────────────────

  @Get('fiscal/documents')
  @ApiOperation({ summary: 'Listar comprobantes fiscales e internos' })
  listFiscalDocuments(
    @Param('restaurantId') restaurantId: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.fiscalDocuments.listDocuments(restaurantId, {
      limit: limit ? Number(limit) : undefined,
      status: status as never,
    });
  }

  @Get('fiscal/documents/:documentId')
  @ApiOperation({ summary: 'Obtener comprobante fiscal/interno' })
  getFiscalDocument(
    @Param('restaurantId') restaurantId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalDocuments.getById(restaurantId, documentId);
  }

  @Get('fiscal/documents/:documentId/pdf')
  @ApiOperation({ summary: 'Descargar PDF del comprobante' })
  async downloadFiscalPdf(
    @Param('restaurantId') restaurantId: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.fiscalDocuments.generatePdf(
      restaurantId,
      documentId,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(buffer);
  }

  @Post('fiscal/documents/:documentId/retry')
  @ApiOperation({ summary: 'Reintentar autorización ARCA de un comprobante' })
  retryFiscalDocument(
    @Param('restaurantId') restaurantId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    void user;
    return this.fiscalDocuments.retryAuthorization(restaurantId, documentId);
  }

  @Post('fiscal/certificate')
  @ApiOperation({ summary: 'Cargar certificado ARCA (PEM)' })
  uploadAfipCertificate(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: UploadAfipCertificateDto,
    @CurrentUser() user: RequestUser,
  ) {
    void user;
    return this.fiscalDocuments.saveAfipCertificate(
      restaurantId,
      dto.certificatePem,
      dto.privateKeyPem,
    );
  }

  @Delete('fiscal/certificate')
  @ApiOperation({ summary: 'Eliminar certificado ARCA almacenado' })
  clearAfipCertificate(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    void user;
    return this.fiscalDocuments.clearAfipCertificate(restaurantId);
  }

  @Post('fiscal/test-connection')
  @ApiOperation({ summary: 'Probar conexión con ARCA (WSAA + WSFE)' })
  testAfipConnection(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    void user;
    return this.fiscalDocuments.testAfipConnection(restaurantId);
  }

  @Get('fiscal/padron/:cuit')
  @ApiOperation({ summary: 'Consultar padrón ARCA por CUIT' })
  lookupPadron(
    @Param('restaurantId') restaurantId: string,
    @Param('cuit') cuit: string,
    @CurrentUser() user: RequestUser,
  ) {
    void user;
    return this.fiscalDocuments.lookupPadron(restaurantId, cuit);
  }

  @Post('fiscal/documents/:documentId/credit-note')
  @ApiOperation({
    summary: 'Emitir nota de crédito sobre comprobante autorizado',
  })
  createCreditNote(
    @Param('restaurantId') restaurantId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    void user;
    return this.fiscalDocuments.createCreditNote(restaurantId, documentId);
  }

  // ─── Equipo de salón (alta rápida) ─────────────────────────────────────────

  @Post('salon-staff/quick')
  @ApiOperation({
    summary:
      'Agregar mozo al equipo desde salón (rol Mesero, sin email manual)',
  })
  quickAddSalonStaff(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() dto: QuickAddSalonStaffDto,
  ) {
    return this.restaurantUsers.quickAddSalonWaiter(restaurantId, dto);
  }

  @Post('salon-delivery-orders')
  @ApiOperation({ summary: 'Alta de pedido domicilio manual desde salón' })
  createSalonDeliveryOrder(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSalonDeliveryOrderDto,
  ) {
    return this.salonDeliveryOrders.create(restaurantId, user.userId, dto);
  }

  @Post('salon-delivery-orders/:orderId/items')
  @ApiOperation({ summary: 'Agregar platos a pedido domicilio del salón' })
  addSalonDeliveryItems(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AddSalonDeliveryItemsDto,
  ) {
    return this.salonDeliveryOrders.addItems(
      restaurantId,
      orderId,
      user.userId,
      dto,
    );
  }

  @Patch('salon-delivery-orders/:orderId')
  @ApiOperation({ summary: 'Actualizar datos de pedido domicilio del salón' })
  updateSalonDeliveryOrder(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateSalonDeliveryOrderDto,
  ) {
    return this.salonDeliveryOrders.update(
      restaurantId,
      orderId,
      user.userId,
      dto,
    );
  }

  @Post('salon-delivery-orders/:orderId/cancel')
  @ApiOperation({ summary: 'Anular pedido domicilio del salón' })
  cancelSalonDeliveryOrder(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.salonDeliveryOrders.cancel(restaurantId, orderId, user.userId);
  }
}
