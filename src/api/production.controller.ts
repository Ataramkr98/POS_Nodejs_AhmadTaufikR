import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/auth';
import { list } from '../common/list';
import { UserRole } from '../generated/prisma/enums';
import { OperationsStoreService } from '../platform/operations-store.service';
import {
  CakeTransitionDto,
  CreateCakeJobDto,
  DateQueryDto,
  PaginationQueryDto,
  RangeQueryDto,
  SearchQueryDto,
} from './api.dto';

const PRODUCTION_ROLES = [
  UserRole.CAKE_CHEF,
  UserRole.PASTRY,
  UserRole.MANAGER,
  UserRole.ADMIN,
] as const;

@ApiTags('production')
@Roles(...PRODUCTION_ROLES)
@Controller('production')
export class ProductionController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get('capacity')
  @ApiOperation({ summary: 'Cake capacity and slot load for a day' })
  capacity(@Query('date') date?: string) {
    return this.store.capacity(date);
  }

  @Get('cake-jobs')
  @ApiOperation({ summary: 'Cake jobs sorted by pickup time' })
  cakes(
    @Query('stage') stage?: string,
    @Query('search') search?: string,
    @Query() page?: PaginationQueryDto,
  ) {
    return this.store.listCakeJobs({ stage, search }, page ?? {});
  }

  @Get('cake-jobs/:id')
  cakeJob(@Param('id') id: string) {
    return this.store.findCakeJob(id);
  }

  @Patch('cake-jobs/:id/stage')
  @ApiOperation({ summary: 'Advance a cake job through the production stages' })
  cakeStage(@Param('id') id: string, @Body() body: CakeTransitionDto) {
    return this.store.transitionCake(id, body.stage);
  }

  @Post('cake-jobs')
  @ApiOperation({ summary: 'Book a new custom cake against live capacity' })
  createCakeJob(@Body() body: CreateCakeJobDto) {
    return this.store.createCakeJob(body);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Scheduled cake jobs within a date range' })
  calendar(@Query() range: RangeQueryDto) {
    return this.store.calendar(range.from, range.to);
  }

  @Get('queue')
  @ApiOperation({ summary: 'Open cake jobs prioritised by pickup time' })
  queue(@Query() query: SearchQueryDto) {
    return this.store.listCakeJobs(
      { stage: query.stage, search: query.search },
      query,
    );
  }

  @Get('prep-sheet')
  @ApiOperation({ summary: 'Prep sheet with rolled-up ingredient totals' })
  prepSheet(@Query() query: DateQueryDto) {
    return this.store.prepSheet(query.date);
  }

  @Get('recipes')
  @ApiOperation({ summary: 'Recipes with ingredient quantities and yields' })
  recipes() {
    return list(this.store.recipes);
  }

  @Get('staffing')
  @ApiOperation({ summary: 'Chef coverage against open cake jobs' })
  staffing() {
    return this.store.staffing();
  }

  @Get('forecasts')
  @ApiOperation({ summary: 'Projected cake demand and capacity risk' })
  forecasts(@Query('days') days?: string) {
    return this.store.forecast(Number(days) || 7);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Lead time and capacity configuration' })
  settings() {
    return {
      minimumLeadTimeHours: 48,
      slotCapacity: 2,
      dailyCapacity: 8,
      rushSurchargePercent: 20,
      chefs: ['Reza', 'Nadia', 'Bimo', 'Citra'],
    };
  }
}
