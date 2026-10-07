import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Public, Roles } from '../common/auth';
import { list } from '../common/list';
import { UserRole } from '../generated/prisma/enums';
import { OperationsStoreService } from '../platform/operations-store.service';
import {
  CatalogQueryDto,
  NotificationTestDto,
  PaginationQueryDto,
  SettingsPatchDto,
  TemplateToggleDto,
  UpdateProductDto,
  WebhookDto,
  WebhookToggleDto,
  WebhookVerifyDto,
} from './api.dto';

const ADMIN_ROLES = [UserRole.MANAGER, UserRole.ADMIN] as const;
const ADMIN_ONLY = [UserRole.ADMIN] as const;

@ApiTags('menu')
@Roles(...ADMIN_ROLES)
@Controller('menu')
export class MenuController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get('products')
  @ApiOperation({ summary: 'Admin catalogue with availability and pricing' })
  products(@Query() query: CatalogQueryDto) {
    return list(
      this.store.listProducts(query).map((product) => ({
        ...product,
        price: { amount: String(product.price), currency: 'IDR' as const },
      })),
    );
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Rename, reprice or toggle availability' })
  update(@Param('id') id: string, @Body() body: UpdateProductDto) {
    const product = this.store.updateProduct(id, body);
    return {
      ...product,
      price: { amount: String(product.price), currency: 'IDR' as const },
    };
  }

  @Get('categories')
  @ApiOperation({ summary: 'Menu categories with item counts' })
  categories() {
    const counts = new Map<string, number>();
    for (const product of this.store.listProducts()) {
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }
    return list(
      this.store.categories.map((category) => ({
        ...category,
        itemCount: counts.get(category.name) ?? 0,
      })),
    );
  }

  @Get('modifiers')
  @ApiOperation({ summary: 'Reusable modifier groups' })
  modifiers() {
    return list(
      this.store.modifierGroups.map((group) => ({
        ...group,
        options: group.options.map((option) => ({
          ...option,
          priceDelta: {
            amount: String(option.priceDelta),
            currency: 'IDR' as const,
          },
        })),
      })),
    );
  }

  @Get('bundles')
  @ApiOperation({ summary: 'Bundle products with compare-at pricing' })
  bundles() {
    return list(this.store.bundles);
  }

  @Get('cake-options')
  @ApiOperation({ summary: 'Cake tiers, sizes, flavours and decorations' })
  cakeOptions() {
    return this.store.cakeOptions;
  }
}

@ApiTags('reports')
@Roles(...ADMIN_ROLES)
@Controller('activity')
export class ActivityController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Operational activity feed' })
  list(@Query() query: PaginationQueryDto) {
    return this.store.listActivity(query);
  }
}

@ApiTags('notifications')
@Roles(...ADMIN_ROLES)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get('templates')
  @ApiOperation({ summary: 'WhatsApp and email templates per event' })
  templates() {
    return list(this.store.notificationTemplates);
  }

  @Patch('templates/:id')
  toggleTemplate(@Param('id') id: string, @Body() body: TemplateToggleDto) {
    const template = this.store.notificationTemplates.find(
      (item) => item.id === id,
    );
    if (!template) {
      throw new NotFoundException('Notification template not found.');
    }
    template.active = body.active;
    return template;
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Recent delivery attempts and their status' })
  deliveries(@Query() query: PaginationQueryDto) {
    const items = this.store.notificationDeliveries;
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    };
  }

  @Post('test')
  @ApiOperation({ summary: 'Queue a sandbox notification' })
  test(@Body() body: NotificationTestDto) {
    return {
      id: randomUUID(),
      channel: body.channel ?? 'WHATSAPP',
      recipient: body.recipient,
      status: 'QUEUED',
      provider: 'sandbox',
      queuedAt: new Date().toISOString(),
    };
  }
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly store: OperationsStoreService) {}

  @Roles(...ADMIN_ONLY)
  @Get()
  @ApiOperation({ summary: 'Merchant webhook endpoints' })
  list() {
    return list(
      this.store.webhooks.map((endpoint) => this.publicEndpoint(endpoint)),
    );
  }

  @Roles(...ADMIN_ONLY)
  @Post()
  @ApiOperation({ summary: 'Register a webhook endpoint' })
  create(@Body() body: WebhookDto) {
    const endpoint = this.store.createWebhook({
      name: body.name,
      url: body.url,
      secret: body.secret,
      events: body.events ?? [],
    });
    return this.publicEndpoint(endpoint);
  }

  @Roles(...ADMIN_ONLY)
  @Patch(':id')
  toggle(@Param('id') id: string, @Body() body: WebhookToggleDto) {
    return this.publicEndpoint(this.store.toggleWebhook(id, body.active));
  }

  @Roles(...ADMIN_ONLY)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.store.deleteWebhook(id);
  }

  @Public()
  @Post('sandbox/verify')
  @ApiOperation({ summary: 'Verify an inbound sandbox signature' })
  verify(
    @Body() body: WebhookVerifyDto,
    @Headers('x-kedai-signature') provided?: string,
  ) {
    const expected = `sha256=${createHmac('sha256', body.secret)
      .update(body.payload)
      .digest('hex')}`;
    const left = Buffer.from(provided ?? '');
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Webhook signature is invalid.');
    }
    return { valid: true };
  }

  @Roles(...ADMIN_ONLY)
  @Post(':id/test')
  @ApiOperation({ summary: 'Sign a sample payload for an endpoint' })
  test(@Param('id') id: string) {
    const endpoint = this.store.findWebhook(id);
    const payload = JSON.stringify({
      event: 'kedai.webhook.test',
      sentAt: new Date().toISOString(),
    });
    return {
      endpointId: id,
      status: 'QUEUED',
      payload,
      signature: `sha256=${createHmac('sha256', endpoint.secret)
        .update(payload)
        .digest('hex')}`,
    };
  }

  private publicEndpoint(endpoint: {
    id: string;
    name: string;
    url: string;
    events: string[];
    active: boolean;
    lastDeliveryStatus: string;
    lastDeliveryAt?: string;
  }) {
    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.events,
      active: endpoint.active,
      lastDeliveryStatus: endpoint.lastDeliveryStatus,
      lastDeliveryAt: endpoint.lastDeliveryAt ?? null,
    };
  }
}

@ApiTags('settings')
@Roles(...ADMIN_ROLES)
@Controller('settings')
export class SettingsController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Current merchant configuration' })
  get() {
    return this.store.settings;
  }

  @Patch()
  @ApiOperation({ summary: 'Merge a partial settings change' })
  save(@Body() body: SettingsPatchDto) {
    return this.store.saveSettings(
      body.patch as unknown as Record<string, unknown>,
    );
  }
}
