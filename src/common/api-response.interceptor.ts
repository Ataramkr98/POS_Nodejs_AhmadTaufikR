import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';

/**
 * Wraps every successful HTTP response in the project-wide envelope:
 *
 * ```json
 * { "success": true, "message": "Human readable summary", "data": {} }
 * ```
 *
 * Controllers therefore stay free of boilerplate and clients only ever parse one
 * shape. `ApiErrorFilter` produces the matching `success: false` counterpart.
 */
@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<{ success: true; message: string; data: unknown }> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((payload: unknown) => ({
        success: true as const,
        message: this.describe(response.statusCode, payload),
        data: payload === undefined ? null : payload,
      })),
    );
  }

  private describe(statusCode: number, payload: unknown) {
    if (statusCode === 201) return 'Created.';
    if (statusCode === 204) return 'Deleted.';
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message: unknown = (payload as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
    return 'Request completed.';
  }
}
