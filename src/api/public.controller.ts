import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth';
import { list } from '../common/list';
import { PrismaService } from '../database/prisma.service';
import { OperationsStoreService } from '../platform/operations-store.service';
import {
  AddCartItemDto,
  ApplyDiscountDto,
  CheckoutDto,
  CreateCartDto,
  UpdateCartItemDto,
} from './api.dto';

function requireIdempotency(value?: string) {
  if (!value?.trim()) {
    throw new BadRequestException('The Idempotency-Key header is required.');
  }
  return value;
}

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  health() {
    return {
      status: 'ok',
      service: 'kedai-backend',
      version: '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      time: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe including datastore reachability' })
  async ready() {
    const database = await this.prisma.isReachable();
    return {
      status: 'ready',
      database: database ? 'connected' : 'demo-dataset',
      realtime: 'ready',
      outbox: database ? 'ready' : 'disabled',
      time: new Date().toISOString(),
    };
  }
}

@ApiTags('branches')
@Public()
@Controller('branches')
export class BranchesController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Active branches' })
  list() {
    return list(this.store.listBranches());
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.store.findBranch(id);
  }
}

@ApiTags('catalog')
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get('products')
  @ApiOperation({ summary: 'Branch-aware storefront catalogue' })
  products(
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    const items = this.store
      .listProducts({ search, category })
      .map((product) => ({
        ...product,
        price: { amount: String(product.price), currency: 'IDR' as const },
      }));
    return list(items);
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Product detail with its modifier groups' })
  product(@Param('slug') slug: string) {
    const product = this.store.findProduct(slug);
    return {
      ...product,
      price: { amount: String(product.price), currency: 'IDR' as const },
      modifierGroups: this.store.modifierGroups,
    };
  }

  @Get('categories')
  categories() {
    return list(this.store.categories);
  }

  @Get('bundles')
  bundles() {
    return list(
      this.store.bundles.map((bundle) => ({
        ...bundle,
        price: { amount: String(bundle.price), currency: 'IDR' as const },
        compareAtPrice: {
          amount: String(bundle.compareAtPrice),
          currency: 'IDR' as const,
        },
      })),
    );
  }

  @Get('cake-options')
  @ApiOperation({ summary: 'Custom cake configuration and pricing options' })
  cakeOptions() {
    return this.store.cakeOptions;
  }
}

/**
 * Browsing, cart and checkout are intentionally reachable without a session: the
 * storefront sells to guests, and the cart id acts as the capability token.
 * Anything that touches money or staff data sits behind `AccessGuard` instead.
 */
@ApiTags('carts')
@Public()
@Controller('carts')
export class CartsController {
  constructor(private readonly store: OperationsStoreService) {}

  @Post()
  create(@Body() body: CreateCartDto) {
    return this.store.createCart(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.store.getCart(id);
  }

  @Post(':id/items')
  add(@Param('id') id: string, @Body() body: AddCartItemDto) {
    return this.store.addCartItem(id, body);
  }

  @Patch(':id/items/:lineId')
  update(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: UpdateCartItemDto,
  ) {
    return this.store.updateCartItem(id, lineId, body);
  }

  @Delete(':id/items/:lineId')
  remove(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.store.removeCartItem(id, lineId);
  }

  @Post(':id/discount')
  discount(@Param('id') id: string, @Body() body: ApplyDiscountDto) {
    return this.store.applyDiscount(id, body);
  }
}

@ApiTags('checkout')
@Public()
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly store: OperationsStoreService) {}

  @Post(':cartId')
  @ApiOperation({ summary: 'Turn a cart into a pending order (idempotent)' })
  checkout(
    @Param('cartId') cartId: string,
    @Body() body: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.store.checkout(
      cartId,
      body,
      requireIdempotency(idempotencyKey),
    );
  }
}

@ApiTags('tables')
@Public()
@Controller('tables')
export class TablesController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Shared table session behind a QR token' })
  get(@Param('token') token: string) {
    const session = this.store.findTableSession(token);
    return {
      ...session,
      branchName: this.store.findBranch(session.branchId).name,
    };
  }

  @Post(':token/bill-request')
  requestBill(@Param('token') token: string) {
    return this.store.requestTableBill(token);
  }
}

@ApiTags('support')
@Public()
@Controller()
export class UtilityController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get('support')
  @ApiOperation({ summary: 'Support channels and response times' })
  support() {
    return this.store.supportDetails();
  }

  @Get('privacy/data-controls')
  @ApiOperation({
    summary: 'Customer data export, deletion and consent controls',
  })
  privacy() {
    return this.store.privacyControls();
  }

  @Get('status')
  @ApiOperation({ summary: 'Per-surface service health' })
  status() {
    return this.store.serviceStatus();
  }
}
