import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AccessGuard, RolesGuard } from './common/auth';
import { ApiResponseInterceptor } from './common/api-response.interceptor';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { PrismaService } from './database/prisma.service';
import {
  BranchesController,
  CartsController,
  CatalogController,
  CheckoutController,
  HealthController,
  TablesController,
  UtilityController,
} from './api/public.controller';
import { OrdersController } from './api/orders.controller';
import { PosController } from './api/pos.controller';
import { KdsController } from './api/kds.controller';
import { ProductionController } from './api/production.controller';
import { InventoryController } from './api/inventory.controller';
import {
  CustomersController,
  LoyaltyController,
  OccasionsController,
  SubscriptionsController,
} from './api/customers.controller';
import { ReportsController } from './api/reports.controller';
import {
  ActivityController,
  MenuController,
  NotificationsController,
  SettingsController,
  WebhooksController,
} from './api/platform.controller';
import { EventsGateway } from './platform/events.gateway';
import { OperationsStoreService } from './platform/operations-store.service';
import { OutboxService } from './platform/outbox.service';
import { RealtimeService } from './platform/realtime.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_ACCESS_SECRET') ??
          'kedai-development-access-secret-change-me',
        signOptions: { issuer: 'kedai-backend', audience: 'kedai-web' },
      }),
    }),
  ],
  controllers: [
    AuthController,
    HealthController,
    BranchesController,
    CatalogController,
    CartsController,
    CheckoutController,
    TablesController,
    OrdersController,
    PosController,
    KdsController,
    ProductionController,
    InventoryController,
    CustomersController,
    LoyaltyController,
    SubscriptionsController,
    OccasionsController,
    ReportsController,
    MenuController,
    ActivityController,
    NotificationsController,
    WebhooksController,
    SettingsController,
    UtilityController,
  ],
  providers: [
    PrismaService,
    OperationsStoreService,
    RealtimeService,
    EventsGateway,
    OutboxService,
    AuthService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
