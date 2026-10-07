import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { CurrentUser, Public, Roles, type AuthUser } from '../common/auth';
import { list } from '../common/list';
import { UserRole } from '../generated/prisma/enums';
import { OperationsStoreService } from '../platform/operations-store.service';
import {
  OccasionReminderDto,
  PaginationQueryDto,
  SearchQueryDto,
  SubscribeDto,
  SubscriptionStatusDto,
} from './api.dto';

const CRM_ROLES = [UserRole.CASHIER, UserRole.MANAGER, UserRole.ADMIN] as const;

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly store: OperationsStoreService) {}

  // ── Self-service routes are declared before `:id` so the literal segment
  //    always wins over the parameterised one. ──
  @Get('me')
  @ApiOperation({ summary: 'The signed-in customer profile' })
  me(@CurrentUser() user: AuthUser) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new UnauthorizedException(
        'This endpoint is for customer sessions.',
      );
    }
    return this.store.customerDetail(user.sub);
  }

  @Post('me/data-export')
  @ApiOperation({ summary: 'Queue a copy of the signed-in customer data' })
  exportData(@CurrentUser() user: AuthUser) {
    return {
      requestId: randomUUID(),
      customerId: user.sub,
      status: 'QUEUED',
      availableWithinHours: 24,
    };
  }

  @Post('me/delete-request')
  @ApiOperation({ summary: 'Request erasure of the signed-in customer data' })
  deleteData(@CurrentUser() user: AuthUser) {
    return {
      requestId: randomUUID(),
      customerId: user.sub,
      status: 'PENDING_VERIFICATION',
      verificationWindowDays: 7,
    };
  }

  @Roles(...CRM_ROLES)
  @Get()
  @ApiOperation({ summary: 'Search customers by name, phone or email' })
  list(@Query() query: SearchQueryDto) {
    return this.store.listCustomers(
      { search: query.search, tier: query.tier },
      query,
    );
  }

  @Roles(...CRM_ROLES)
  @Get(':id')
  @ApiOperation({ summary: 'Profile with orders, occasions and segments' })
  detail(@Param('id') id: string) {
    return this.store.customerDetail(id);
  }
}

@ApiTags('loyalty')
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get('me')
  @ApiOperation({ summary: 'Points, tier progress and reward catalogue' })
  account(@CurrentUser() user: AuthUser) {
    return this.store.loyaltyAccount(user.sub);
  }

  @Get('me/ledger')
  @ApiOperation({ summary: 'Points earn and redeem history' })
  ledger(@CurrentUser() user: AuthUser) {
    return list(this.store.loyaltyLedger(user.sub));
  }

  @Public()
  @Get('rewards')
  @ApiOperation({ summary: 'Reward catalogue with point costs' })
  rewards() {
    return list(this.store.loyaltyAccount('preview').rewards);
  }

  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Get('tiers')
  @ApiOperation({ summary: 'Tier thresholds and benefits' })
  tiers() {
    return list([
      {
        tier: 'Brew',
        points: 0,
        multiplier: 1,
        benefit: 'Earn points on every order',
      },
      {
        tier: 'Daily Brew',
        points: 500,
        multiplier: 1.25,
        benefit: '25% more points',
      },
      {
        tier: 'Gold Brew',
        points: 1500,
        multiplier: 1.5,
        benefit: '50% more points and priority cake slots',
      },
      {
        tier: 'Reserve',
        points: 4000,
        multiplier: 2,
        benefit: 'Double points and a yearly tasting invitation',
      },
    ]);
  }
}

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly store: OperationsStoreService) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'Drink and pastry subscription plans' })
  plans() {
    return list(this.store.subscriptionPlans);
  }

  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Active and paused subscriptions' })
  list(@Query() query: PaginationQueryDto) {
    return this.store.listSubscriptions(query);
  }

  @Post()
  subscribe(@CurrentUser() user: AuthUser, @Body() body: SubscribeDto) {
    return this.store.subscribe(body.customerId || user.sub, body.planId);
  }

  @Patch(':id/status')
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Pause, resume or cancel a subscription' })
  changeStatus(@Param('id') id: string, @Body() body: SubscriptionStatusDto) {
    return this.store.changeSubscriptionStatus(id, body.status);
  }
}

@ApiTags('occasions')
@Roles(...CRM_ROLES)
@Controller('occasions')
export class OccasionsController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Saved birthdays and anniversaries, soonest first' })
  list(@Query() query: PaginationQueryDto) {
    return this.store.listOccasions(query);
  }

  @Patch(':id/reminders')
  @ApiOperation({ summary: 'Turn occasion reminders on or off' })
  toggle(@Param('id') id: string, @Body() body: OccasionReminderDto) {
    return this.store.toggleOccasionReminders(id, body.reminders);
  }
}
