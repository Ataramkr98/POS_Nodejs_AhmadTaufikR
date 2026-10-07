import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { ApiErrorFilter } from './../src/common/api-error.filter';

interface Envelope<T> {
  success: boolean;
  message: string;
  data: T;
  statusCode?: number;
  code?: string;
  requestId?: string;
}

describe('KEDAI API (e2e)', () => {
  let app: INestApplication<App>;
  let cookie: string;

  const authed = (req: request.Test) => req.set('Cookie', cookie);

  /** Signs a staff member in and returns their session cookie header. */
  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ email, secret: '1234' })
      .expect(201);
    return (response.headers['set-cookie'] as unknown as string[])
      .map((entry) => entry.split(';')[0])
      .join('; ');
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
  });

  it('reports health and readiness', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    const body = response.body as Envelope<{ status: string; service: string }>;
    expect(body.success).toBe(true);
    expect(body.message).toBeTruthy();
    expect(body.data.service).toBe('kedai-backend');

    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
  });

  it('serves a priced, searchable catalogue', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/products')
      .expect(200);
    const body = response.body as Envelope<{
      items: Array<{
        name: string;
        price: { amount: string; currency: string };
      }>;
      total: number;
    }>;

    expect(body.data.total).toBeGreaterThanOrEqual(10);
    expect(body.data.items[0].price).toEqual({
      amount: '42000',
      currency: 'IDR',
    });

    const search = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?search=tiramisu')
      .expect(200);
    expect(
      (search.body as Envelope<{ items: unknown[] }>).data.items,
    ).toHaveLength(1);
  });

  it('404s an unknown product instead of returning a blank payload', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/products/does-not-exist')
      .expect(404);
    const body = response.body as Envelope<null>;
    expect(body.success).toBe(false);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.data).toBeNull();
    expect(body.requestId).toBeTruthy();
  });

  it('rejects malformed input with field level errors', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/carts')
      .send({ branchId: 'not-a-uuid', unexpected: true })
      .expect(400);
    const body = response.body as Envelope<null> & {
      fieldErrors?: Record<string, string[]>;
    };
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors).toBeTruthy();
  });

  it('completes cart, checkout, payment and refund with idempotency', async () => {
    const cart = await request(app.getHttpServer())
      .post('/api/v1/carts')
      .send({})
      .expect(201);
    const cartId = (cart.body as Envelope<{ id: string }>).data.id;

    await request(app.getHttpServer())
      .post(`/api/v1/carts/${cartId}/items`)
      .send({ productId: '10000000-0000-4000-8000-000000000001', quantity: 2 })
      .expect(201);

    const checkout = await request(app.getHttpServer())
      .post(`/api/v1/checkout/${cartId}`)
      .set('Idempotency-Key', 'e2e-checkout')
      .send({ fulfilmentMode: 'TAKEAWAY' })
      .expect(201);
    const order = (
      checkout.body as Envelope<{
        id: string;
        status: string;
        total: { amount: string };
      }>
    ).data;
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.total.amount).toBe('84000');

    // A replayed key must not create a second order.
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/checkout/${cartId}`)
      .set('Idempotency-Key', 'e2e-checkout')
      .send({ fulfilmentMode: 'TAKEAWAY' })
      .expect(201);
    expect((replay.body as Envelope<{ id: string }>).data.id).toBe(order.id);

    // Settling money requires a staff session.
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/payments`)
      .set('Idempotency-Key', 'e2e-payment-anon')
      .send({ method: 'QRIS' })
      .expect(401);

    const cashierCookie = await login('cashier@kedai.local');
    const payment = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/payments`)
      .set('Cookie', cashierCookie)
      .set('Idempotency-Key', 'e2e-payment')
      .send({ method: 'QRIS' })
      .expect(201);
    expect(
      (payment.body as Envelope<{ status: string; amount: { amount: string } }>)
        .data,
    ).toEqual(
      expect.objectContaining({
        status: 'SETTLED',
        amount: { amount: '84000', currency: 'IDR' },
      }),
    );

    // Refunds are manager-only and additionally require the manager PIN.
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/refunds`)
      .set('Cookie', cashierCookie)
      .set('Idempotency-Key', 'e2e-refund-forbidden')
      .send({ amount: 1000, reason: 'verification', managerPin: '2468' })
      .expect(403);

    const managerCookie = await login('manager@kedai.local');
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/refunds`)
      .set('Cookie', managerCookie)
      .set('Idempotency-Key', 'e2e-refund-denied')
      .send({ amount: 1000, reason: 'verification', managerPin: '0000' })
      .expect(403);

    const refund = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/refunds`)
      .set('Cookie', managerCookie)
      .set('Idempotency-Key', 'e2e-refund')
      .send({ amount: 40000, reason: 'Damaged pastry', managerPin: '2468' })
      .expect(201);
    expect(
      (refund.body as Envelope<{ amount: { amount: string } }>).data.amount
        .amount,
    ).toBe('40000');
  });

  it('enforces authentication and role scoping', async () => {
    await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
    await request(app.getHttpServer()).get('/api/v1/inventory').expect(401);

    const manager = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ email: 'manager@kedai.local', secret: '1234' })
      .expect(201);
    const cookies = manager.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((entry) => entry.startsWith('kedai_access='))).toBe(
      true,
    );
    expect(cookies.some((entry) => entry.includes('HttpOnly'))).toBe(true);
    cookie = cookies.map((entry) => entry.split(';')[0]).join('; ');

    await authed(request(app.getHttpServer()).get('/api/v1/inventory')).expect(
      200,
    );
    await authed(
      request(app.getHttpServer()).get('/api/v1/reports/dashboard'),
    ).expect(200);
    // Webhook administration is restricted to ADMIN.
    await authed(request(app.getHttpServer()).get('/api/v1/webhooks')).expect(
      403,
    );

    const cashier = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ email: 'cashier@kedai.local', secret: '1234' })
      .expect(201);
    const cashierCookies = (
      cashier.headers['set-cookie'] as unknown as string[]
    )
      .map((entry) => entry.split(';')[0])
      .join('; ');

    await request(app.getHttpServer())
      .get('/api/v1/orders?pageSize=1')
      .set('Cookie', cashierCookies)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/inventory')
      .set('Cookie', cashierCookies)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/kds/tickets')
      .set('Cookie', cashierCookies)
      .expect(403);
  });

  it('runs a customer session end to end', async () => {
    const otp = await request(app.getHttpServer())
      .post('/api/v1/auth/customer/otp')
      .send({ phone: '+6281234567890' })
      .expect(201);
    const code = (otp.body as Envelope<{ developmentCode?: string }>).data
      .developmentCode;
    expect(code).toBe('111111');

    const session = await request(app.getHttpServer())
      .post('/api/v1/auth/customer/verify')
      .send({ phone: '+6281234567890', code })
      .expect(201);
    const cookies = (session.headers['set-cookie'] as unknown as string[])
      .map((entry) => entry.split(';')[0])
      .join('; ');

    const profile = await request(app.getHttpServer())
      .get('/api/v1/customers/me')
      .set('Cookie', cookies)
      .expect(200);
    expect(
      (profile.body as Envelope<{ customer: { name: string } }>).data.customer
        .name,
    ).toBe('Andi Wijaya');

    await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Cookie', cookies)
      .expect(403);
  });

  it('shares table sessions behind a QR token', async () => {
    const session = await request(app.getHttpServer())
      .get('/api/v1/tables/TBL-SCBD-04')
      .expect(200);
    expect(
      (session.body as Envelope<{ tableLabel: string }>).data.tableLabel,
    ).toBe('Table 04');

    const bill = await request(app.getHttpServer())
      .post('/api/v1/tables/TBL-SCBD-04/bill-request')
      .expect(201);
    expect((bill.body as Envelope<{ status: string }>).data.status).toBe(
      'BILL_REQUESTED',
    );

    await request(app.getHttpServer()).get('/api/v1/tables/NOPE').expect(404);
  });

  it('exposes operational reporting for staff', async () => {
    const dashboard = await authed(
      request(app.getHttpServer()).get('/api/v1/reports/dashboard?days=30'),
    ).expect(200);
    const data = (
      dashboard.body as Envelope<{
        metrics: Array<{ key: string }>;
        revenueSeries: unknown[];
        branchPerformance: unknown[];
      }>
    ).data;
    expect(data.metrics).toHaveLength(4);
    expect(data.revenueSeries).toHaveLength(30);
    expect(data.branchPerformance).toHaveLength(3);
  });

  afterAll(async () => {
    await app.close();
  });
});
