import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    request: Request & { requestId?: string },
    response: Response,
    next: NextFunction,
  ) {
    const provided = request.header('x-request-id');
    request.requestId = provided || randomUUID();
    response.setHeader('x-request-id', request.requestId);
    next();
  }
}
