import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/auth';
import { list } from '../common/list';
import { UserRole } from '../generated/prisma/enums';
import { OperationsStoreService } from '../platform/operations-store.service';
import { RangeQueryDto } from './api.dto';

const REPORT_ROLES = [UserRole.MANAGER, UserRole.ADMIN] as const;

@ApiTags('reports')
@Roles(...REPORT_ROLES)
@Controller('reports')
export class ReportsController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Executive KPIs, trends, top items and alerts' })
  dashboard(
    @Query('branchId') branchId?: string,
    @Query('days') days?: string,
  ) {
    return this.store.dashboard({ branchId, days: Number(days) || 30 });
  }

  @Get('sales')
  @ApiOperation({ summary: 'Sales totals, top products and hourly demand' })
  sales(@Query() query: RangeQueryDto) {
    return this.store.salesReport(query);
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Best selling items by revenue' })
  topProducts(@Query('limit') limit?: string) {
    return list(this.store.topProductsReport(Math.min(20, Number(limit) || 8)));
  }

  @Get('cake-production')
  @ApiOperation({ summary: 'Cake throughput, stages and deposits held' })
  cakeProduction() {
    return this.store.cakeProductionReport();
  }

  @Get('forecast')
  @ApiOperation({ summary: 'Projected cake demand and staffing risk' })
  forecast(@Query('days') days?: string) {
    return this.store.forecast(Number(days) || 7);
  }
}
