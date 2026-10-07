import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ValidationDetail = {
  message?: string | string[];
  error?: string;
  code?: string;
};

/**
 * Mirrors `ApiResponseInterceptor` for failures so clients only ever parse one
 * envelope shape, and always receive a `requestId` they can quote in a bug report.
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { requestId?: string }>();
    const response = context.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const statusCode = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = isHttp ? exception.getResponse() : undefined;
    const detail: ValidationDetail = typeof raw === 'object' && raw ? raw : {};

    const validationMessages = Array.isArray(detail.message)
      ? detail.message
      : undefined;
    const fieldErrors = validationMessages?.reduce<Record<string, string[]>>(
      (errors, message) => {
        const [field = 'request'] = message.split(' ');
        errors[field] = [...(errors[field] ?? []), message];
        return errors;
      },
      {},
    );

    const message =
      validationMessages?.[0] ??
      (typeof detail.message === 'string' ? detail.message : undefined) ??
      (isHttp ? exception.message : 'An unexpected error occurred.');

    response.status(statusCode).json({
      success: false,
      statusCode,
      code:
        detail.code ??
        (statusCode === 400
          ? 'VALIDATION_FAILED'
          : statusCode === 401
            ? 'UNAUTHENTICATED'
            : statusCode === 403
              ? 'FORBIDDEN'
              : statusCode === 404
                ? 'NOT_FOUND'
                : statusCode === 409
                  ? 'CONFLICT'
                  : 'INTERNAL_ERROR'),
      message,
      data: null,
      ...(fieldErrors ? { fieldErrors } : {}),
      requestId: request.requestId ?? request.headers['x-request-id'],
      timestamp: new Date().toISOString(),
    });
  }
}
