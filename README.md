# KEDAI Backend

NestJS 11 API for the KEDAI cafe operations platform: catalogue, carts, orders,
payments, kitchen display, cake production, inventory, customers, loyalty,
subscriptions, reporting and administration.

See the [root README](../README.md) for the architecture and demo accounts.

## Quick start

```bash
cp .env.example .env
npm install
npm run start:dev        # http://localhost:4000/api/v1
```

No database is required. The demo dataset is generated in memory at boot.
Swagger UI is served at `/api/docs` outside production.

## Commands

```bash
npm run start:dev        # watch mode
npm run build            # compile to dist/
npm run start:prod       # run the compiled server
npm run lint             # ESLint
npm test                 # 53 unit tests
npm run test:e2e         # 9 end-to-end tests through the real HTTP stack
npm run verify:api       # 178 live assertions (needs the server running)
npm run prisma:generate  # generate the client from prisma/schema.prisma
npm run prisma:migrate   # apply migrations (requires DATABASE_URL)
npm run prisma:seed      # load reference data into Postgres
```

## Structure

```
src/
├── api/          9 controller modules, one per domain, plus shared DTOs
├── auth/         OTP and staff-PIN sign-in, session store, JWT, demo accounts
├── common/       envelope interceptor, error filter, guards, money, list, pagination
├── database/     Prisma service (reachability probe for /health/ready)
├── platform/     demo dataset generator, operations store, realtime, outbox
├── app.module.ts module wiring, guard order, interceptor registration
└── main.ts       global prefix, CORS, helmet, validation, Swagger
```

## Design notes

**Guards run in this order:** `ThrottlerGuard → AccessGuard → RolesGuard`.
`AccessGuard` accepts either a JWT access token or a live session id; every
session is also stored server-side so a logout revokes it immediately.

**Controllers return payloads, not envelopes.** `ApiResponseInterceptor` wraps
every success once, and `ApiErrorFilter` produces the matching `success: false`
shape with `fieldErrors` and a `requestId`.

**Collections** return `{ items, total }`, plus pagination fields when paged.
**Money** is always `{ amount: string, currency: "IDR" }`, so no client ever does
floating-point arithmetic on an IDR amount.

**Idempotency.** Checkout, payment and refund require an `Idempotency-Key`
header; a replay returns the original result rather than creating a duplicate.

**State machines** are declared as transition maps and enforced in one place, so
an illegal transition is a `409` with the offending states named.

**Validation** is a strict whitelist: unknown query parameters and unknown body
keys are rejected with `fieldErrors`, and nested settings are validated
recursively so a typo is a `400` rather than a silent no-op.

## Database

`prisma/schema.prisma` models the production domain: 36 models with relations,
indexes and a compound one-per-customer-per-day loyalty key, plus migrations and
a seed. The demo build does not query it — `OperationsStoreService` serves a
deterministic in-process dataset instead, which is what lets a reviewer run the
whole system with one command. `GET /api/v1/health/ready` reports which mode is
active (`demo-dataset` or `connected`).
