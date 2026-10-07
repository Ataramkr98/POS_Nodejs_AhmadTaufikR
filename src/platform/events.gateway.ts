import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';

@WebSocketGateway({
  namespace: '/operations',
  cors: { origin: true, credentials: true },
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(private readonly realtime: RealtimeService) {}

  afterInit(server: Server) {
    this.realtime.attach(server);
  }

  handleConnection(client: Socket) {
    client.emit('connected', {
      socketId: client.id,
      resync: '/api/v1/orders?status=open',
    });
  }

  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { branchId?: string; stationId?: string; orderId?: string },
  ) {
    const rooms = [
      body.branchId && `branch:${body.branchId}`,
      body.stationId && `station:${body.stationId}`,
      body.orderId && `order:${body.orderId}`,
    ].filter((room): room is string => Boolean(room));
    await client.join(rooms);
    return { joined: rooms, resyncRequired: true };
  }
}
