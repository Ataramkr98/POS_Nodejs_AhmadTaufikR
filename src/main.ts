import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './common/api-error.filter';

const PORT = Number(process.env.PORT ?? 4000);
const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

async function bootstrap() {
  const logger = new Logger('KEDAI');
  const app = await NestFactory.create(AppModule, { logger });

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  const origins = (process.env.WEB_ORIGIN ?? DEFAULT_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
    exposedHeaders: ['x-request-id'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new ApiErrorFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('KEDAI Operational API')
    .setDescription(
      'Storefront, POS, KDS, production, inventory and administration APIs. ' +
        'Every response uses the envelope `{ success, message, data }`; failures ' +
        'add `statusCode`, `code`, `requestId` and `timestamp`.',
    )
    .setVersion('1.0.0')
    .addCookieAuth('kedai_access')
    .addBearerAuth()
    .build();

  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'KEDAI API documentation',
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(PORT, '0.0.0.0');
  logger.log(`KEDAI API ready on http://localhost:${PORT}/api/v1`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`OpenAPI explorer on http://localhost:${PORT}/api/docs`);
  }
}

void bootstrap();
