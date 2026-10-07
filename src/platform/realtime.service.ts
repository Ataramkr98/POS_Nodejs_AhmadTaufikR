import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class RealtimeService {
  private server?: Server;

  attach(server: Server) {
    this.server = server;
  }

  emitBranch(branchId: string, event: string, payload: unknown) {
    this.server?.to(`branch:${branchId}`).emit(event, payload);
  }

  emitStation(stationId: string, event: string, payload: unknown) {
    this.server?.to(`station:${stationId}`).emit(event, payload);
  }

  emitOrder(orderId: string, event: string, payload: unknown) {
    this.server?.to(`order:${orderId}`).emit(event, payload);
  }
}
