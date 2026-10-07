import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { UserRole } from '../generated/prisma/enums';
import { OperationsStoreService } from '../platform/operations-store.service';
import {
  OrderQueryDto,
  PaginationQueryDto,
  PaymentDto,
  RefundDto,
  TransitionDto,
} from './api.dto';

const STAFF_ROLES = [
  UserRole.CASHIER,
  UserRole.BARISTA,
  UserRole.PASTRY,
  UserRole.CAKE_CHEF,
  UserRole.MANAGER,
  UserRole.ADMIN,
] as const;

/**
 * Payments and refunds must never be replayed, so both routes demand a caller
 * supplied key. The two controllers that guard these operations raise the same
 * `400 BAD_REQUEST` so clients can handle one error shape.
 */
function requireIdempotency(value?: string) {
  if (!value?.trim()) {
    throw new BadRequestException('The Idempotency-Key header is required.');
  }
  return value;
}

/**
 * Staff can only read orders inside their own branch; ADMIN can read any branch
 * by passing an explicit `branchId`.
 */
function assertBranchScope(user: AuthUser, branchId?: string) {
  if (branchId && user.role !== UserRole.ADMIN && branchId !== user.branchId) {
    throw new ForbiddenException(
      'Staff access is restricted to the assigned branch.',
    );
  }
  return user.role === UserRole.ADMIN ? branchId : user.branchId;
}

@ApiTags('orders')
@Roles(...STAFF_ROLES)
@Controller('orders')
export class OrdersController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Searchable, paginated order list' })
  list(@CurrentUser() user: AuthUser, @Query() query: OrderQueryDto) {
    const branchId = assertBranchScope(user, query.branchId);
    return this.store.listOrders({ ...query, branchId }, query);
  }

  @Get('reports/receipts')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Receipts issued in this shift' })
  receipts(@Query() query: PaginationQueryDto) {
    return this.store.listReceipts(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Order detail with permitted next transitions' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = this.store.orderDto(this.store.findOrder(id));
    assertBranchScope(user, order.branchId);
    return order;
  }

  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() body: TransitionDto) {
    return this.store.transitionOrder(id, body.status);
  }

  @Post(':id/payments')
  @Roles(UserRole.CASHIER, UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Settle a pending order through the sandbox gateway',
  })
  pay(
    @Param('id') id: string,
    @Body() body: PaymentDto,
    @Headers('idempotency-key') idempotency?: string,
  ) {
    return this.store.settlePayment(id, body, requireIdempotency(idempotency));
  }

  @Post(':id/refunds')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Refund an order in full or in part' })
  refund(
    @Param('id') id: string,
    @Body() body: RefundDto,
    @Headers('idempotency-key') idempotency?: string,
  ) {
    return this.store.refund(id, body, requireIdempotency(idempotency));
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'Issue or fetch the printable receipt' })
  receipt(@Param('id') id: string) {
    return this.store.getReceipt(id);
  }
}
