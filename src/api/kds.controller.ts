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
import { randomUUID } from 'node:crypto';
import { Roles } from '../common/auth';
import { list } from '../common/list';
import { UserRole } from '../generated/prisma/enums';
import { OperationsStoreService } from '../platform/operations-store.service';
import {
  KdsTicketQueryDto,
  ManualTaskDto,
  PaginationQueryDto,
  TransitionDto,
} from './api.dto';

const KITCHEN_ROLES = [
  UserRole.BARISTA,
  UserRole.PASTRY,
  UserRole.CAKE_CHEF,
  UserRole.MANAGER,
  UserRole.ADMIN,
] as const;

@ApiTags('kds')
@Roles(...KITCHEN_ROLES)
@Controller('kds')
export class KdsController {
  constructor(private readonly store: OperationsStoreService) {}

  @Get('stations')
  @ApiOperation({ summary: 'Stations with their open ticket counts' })
  stations() {
    return list(this.store.stations);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'Kitchen tickets, highest priority first' })
  tickets(@Query() query: KdsTicketQueryDto) {
    return this.store.listTasks(query.station, query);
  }

  @Patch('tickets/:id/status')
  @ApiOperation({ summary: 'Move a ticket through the kitchen state machine' })
  transition(@Param('id') id: string, @Body() body: TransitionDto) {
    return this.store.transitionTask(id, body.status);
  }

  @Post('manual-orders')
  @ApiOperation({ summary: 'Raise a ticket for a walk-up exception' })
  manual(@Body() body: ManualTaskDto) {
    const task = {
      id: randomUUID(),
      station: body.station ?? ('BAR' as const),
      item: body.item,
      status: 'QUEUED',
      priority: body.priority ?? 0,
      ticketNumber: 'MANUAL',
      destination: 'Counter',
      allergenWarning: '',
      createdAt: new Date().toISOString(),
    };
    return task;
  }

  @Get('display-case')
  @ApiOperation({ summary: 'Slice counts in the pastry display case' })
  displayCase(@Query() query: PaginationQueryDto) {
    return this.store.listDisplayCase(query);
  }
}
