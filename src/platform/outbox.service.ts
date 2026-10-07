import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/15 * * * * *')
  async deliverSandboxEvents() {
    const client = this.prisma.client;
    if (!client) return;
    const events = await client.outboxEvent.findMany({
      where: { processedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const event of events) {
      this.logger.debug(`Sandbox delivery: ${event.topic} ${event.id}`);
      await client.outboxEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), attempts: { increment: 1 } },
      });
    }
  }
}
