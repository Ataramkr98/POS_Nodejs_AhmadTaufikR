import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { list } from '../common/list';
import { UserRole } from '../generated/prisma/enums';
import { OperationsStoreService } from '../platform/operations-store.service';
import {
  CustomPosItemDto,
  OrderQueryDto,
  PaginationQueryDto,
  PosDiscountPreviewDto,
} from './api.dto';

const CASHIER_ROLES = [
  UserRole.CASHIER,
  UserRole.MANAGER,
  UserRole.ADMIN,
] as const;

@ApiTags('pos')
@Roles(...CASHIER_ROLES)
@Controller('pos')
export class PosController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get('terminal')
  @ApiOperation({
    summary: 'Terminal identity, drawer state and shift context',
  })
  terminal(@CurrentUser() user: AuthUser) {
    const open = this.store.listOrders(
      { status: 'open', branchId: user.branchId },
      { pageSize: 200 },
    ).items;
    const unpaid = open.filter((order) => order.status === 'PENDING_PAYMENT');
    return {
      id: 'terminal-scbd-01',
      name: 'SCBD Cashier 01',
      branchId: user.branchId,
      branchName: user.branchId
        ? this.store.findBranch(user.branchId).name
        : '',
      status: 'ONLINE',
      cashDrawer: 'CLOSED',
      provider: 'sandbox',
      cashier: user.name,
      openedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      shift: {
        openOrders: open.length,
        awaitingPayment: unpaid.length,
        awaitingPaymentValue: unpaid.reduce(
          (sum, order) => sum + Number(order.total.amount),
          0,
        ),
      },
      paymentMethods: ['QRIS', 'CASH', 'CARD', 'TRANSFER'],
    };
  }

  @Get('orders')
  @ApiOperation({ summary: 'Today\u2019s ticket queue for the terminal' })
  orders(@CurrentUser() user: AuthUser, @Query() query: OrderQueryDto) {
    return this.store.listOrders(
      { ...query, status: query.status ?? 'open', branchId: user.branchId },
      query,
    );
  }

  @Get('pickups')
  @ApiOperation({ summary: 'Pre-orders grouped by pickup readiness' })
  pickups(@CurrentUser() user: AuthUser) {
    const orders = this.store.listOrders(
      { branchId: user.branchId, status: 'open' },
      { pageSize: 200 },
    ).items;
    const preOrders = orders.filter(
      (order) =>
        order.fulfilmentMode === 'PRE_ORDER' || order.pickupAt !== null,
    );
    return list(
      preOrders.map((order) => ({
        id: order.id,
        ticketNumber: order.ticketNumber,
        customerName: order.customerName ?? 'Walk-in customer',
        pickupAt: order.pickupAt,
        fulfilmentMode: order.fulfilmentMode,
        status: order.status,
        items: order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
        })),
        total: order.total,
      })),
    );
  }

  @Get('discounts')
  @ApiOperation({ summary: 'Promo codes available on this terminal' })
  discounts() {
    return list(
      this.store.discounts
        .filter((discount) => discount.active)
        .map((discount) => ({
          code: discount.code,
          kind: discount.kind,
          value: discount.value,
          description:
            discount.kind === 'PERCENT'
              ? `${discount.value}% off the basket`
              : 'Rp25.000 off the basket',
        })),
    );
  }

  @Post('discounts/preview')
  @ApiOperation({ summary: 'Preview a promo code against an amount' })
  previewDiscount(@Body() body: PosDiscountPreviewDto) {
    const discount = this.store.discounts.find(
      (item) => item.code === body.code.trim().toUpperCase() && item.active,
    );
    if (!discount) {
      return { valid: false, message: 'That promo code is not valid.' };
    }
    const reduction =
      discount.kind === 'PERCENT'
        ? Math.round((body.amount * discount.value) / 100)
        : Math.min(discount.value, body.amount);
    return {
      valid: true,
      code: discount.code,
      reduction: { amount: String(reduction), currency: 'IDR' as const },
      remaining: {
        amount: String(body.amount - reduction),
        currency: 'IDR' as const,
      },
    };
  }

  @Post('custom-items')
  @ApiOperation({
    summary: 'Open-price item that always needs manager approval',
  })
  customItem(@Body() body: CustomPosItemDto) {
    return this.store.createCustomPosItem(body);
  }

  @Post('pickup/:orderId/verify')
  @ApiOperation({ summary: 'Verify a prepaid pickup against the order' })
  pickup(@Param('orderId') orderId: string) {
    return this.store.verifyPickup(orderId);
  }

  @Get('split-bill/:orderId')
  @ApiOperation({ summary: 'Even and by-item split suggestions for an order' })
  splitBill(@Param('orderId') orderId: string, @Query('parts') parts?: string) {
    const order = this.store.orderDto(this.store.findOrder(orderId));
    const count = Math.min(10, Math.max(2, Number(parts) || 2));
    const total = Number(order.total.amount);
    const base = Math.floor(total / count);
    const remainder = total - base * count;
    return {
      orderId: order.id,
      ticketNumber: order.ticketNumber,
      total: order.total,
      suggestedParts: Array.from({ length: count }, (_, index) => ({
        index: index + 1,
        amount: {
          amount: String(base + (index < remainder ? 1 : 0)),
          currency: 'IDR' as const,
        },
      })),
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
    };
  }

  @Get('settings')
  @ApiOperation({ summary: 'Terminal printer and offline preferences' })
  settings() {
    const settings = this.store.settings as {
      pos?: Record<string, unknown>;
      commerce?: Record<string, unknown>;
    };
    return {
      pos: settings.pos ?? {},
      commerce: settings.commerce ?? {},
    };
  }

  @Get('lock')
  @ApiOperation({ summary: 'Lock state for the shared terminal' })
  lock() {
    return { locked: false, lockedAt: null, terminalId: 'terminal-scbd-01' };
  }

  @Post('lock')
  @ApiOperation({
    summary: 'Lock the terminal until a staff member signs in again',
  })
  lockTerminal() {
    return { locked: true, lockedAt: new Date().toISOString() };
  }

  @Get('customers')
  @ApiOperation({ summary: 'Customer lookup for attaching to a ticket' })
  customers(
    @Query() query: { search?: string; page?: number; pageSize?: number },
  ) {
    return this.store.listCustomers({ search: query.search }, query);
  }

  @Get('tables')
  @ApiOperation({ summary: 'Open table sessions in this branch' })
  tables(@Query() query: PaginationQueryDto) {
    return this.store.listTableSessions(query);
  }
}
