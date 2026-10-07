import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/auth';
import { list } from '../common/list';
import { UserRole } from '../generated/prisma/enums';
import { OperationsStoreService } from '../platform/operations-store.service';
import {
  PaginationQueryDto,
  RecountDto,
  SearchQueryDto,
  StockAdjustmentDto,
} from './api.dto';

const INVENTORY_ROLES = [UserRole.MANAGER, UserRole.ADMIN] as const;

@ApiTags('inventory')
@Roles(...INVENTORY_ROLES)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get()
  @ApiOperation({
    summary: 'Ingredient balances with supplier and reorder level',
  })
  list(@Query() query: SearchQueryDto) {
    return this.store.listIngredients(
      { search: query.search, status: query.status },
      query,
    );
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Open low-stock alerts' })
  alerts() {
    return list(this.store.stockAlerts());
  }

  @Get('display-case')
  @ApiOperation({ summary: 'Display case slice counts' })
  displayCase(@Query() query: PaginationQueryDto) {
    return this.store.listDisplayCase(query);
  }

  @Post('display-case/:productId/recount')
  @ApiOperation({ summary: 'Recount a display case product' })
  recount(@Param('productId') productId: string, @Body() body: RecountDto) {
    return this.store.recountDisplayCase(productId, body.quantity);
  }

  @Get('recipes')
  @ApiOperation({ summary: 'Menu-to-ingredient recipe mappings' })
  recipes() {
    return list(this.store.recipes);
  }

  @Post(':ingredientId/adjustments')
  @ApiOperation({ summary: 'Adjust stock; manager PIN required' })
  adjust(
    @Param('ingredientId') ingredientId: string,
    @Body() body: StockAdjustmentDto,
  ) {
    return this.store.adjustStock(ingredientId, body);
  }
}
