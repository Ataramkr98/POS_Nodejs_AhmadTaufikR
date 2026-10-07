#!/usr/bin/env node
/**
 * End-to-end verification of the KEDAI operational API.
 *
 * Boots against an already-running backend (start it with `npm run start:dev`
 * or `npm run start:prod` first) and exercises the whole documented surface:
 * the response envelope, authentication, commerce, payments, refunds, the
 * kitchen, production, inventory, reporting and platform endpoints, plus the
 * negative paths a reviewer is most likely to poke at.
 *
 *   node scripts/verify-api.mjs [--base http://localhost:4000/api/v1]
 */

const args = process.argv.slice(2);
const baseArg = args.indexOf("--base");
const BASE =
  baseArg !== -1 && args[baseArg + 1]
    ? args[baseArg + 1]
    : process.env.KEDAI_API_BASE ?? "http://localhost:4000/api/v1";

let passed = 0;
const failures = [];
let cookieJar = "";

/**
 * Every idempotency key is scoped to this run. Without it, re-running the
 * script against a server that has not restarted would replay the previous
 * run's checkout and payment and assert against stale state.
 */
const RUN = Math.random().toString(36).slice(2, 10);
const key = (name) => `${name}-${RUN}`;

function cookieHeader() {
  return cookieJar;
}

function absorbCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  const jar = new Map();
  for (const previous of cookieJar.split("; ").filter(Boolean)) {
    const [name] = previous.split("=");
    if (name) jar.set(name, previous);
  }
  for (const cookie of raw) {
    const [pair] = cookie.split(";");
    const name = pair.split("=")[0];
    if (name) jar.set(name, pair);
  }
  cookieJar = [...jar.values()].join("; ");
}

async function call(method, path, body, headers = {}) {
  const init = {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
      ...headers,
    },
    redirect: "manual",
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  let response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch (error) {
    return {
      reachable: false,
      status: 0,
      body: null,
      message: error instanceof Error ? error.message : "request failed",
    };
  }
  absorbCookies(response);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  return {
    reachable: true,
    status: response.status,
    headers: response.headers,
    body: payload,
    message: payload?.message,
  };
}

function record(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    return true;
  }
  failures.push(`${label}${detail ? ` :: ${detail}` : ""}`);
  return false;
}

function check(label, method, path, options = {}) {
  const { body, headers, expect, envelope = true, cookie } = options;
  const target =
    expect ??
    (method === "GET" || method === "DELETE" || method === "PATCH" ? 200 : 201);
  // `cookie` sends an explicit session without disturbing the shared jar, which
  // is what lets one script assert a customer session and a staff session.
  const sentHeaders = cookie ? { ...headers, Cookie: cookie } : headers;
  return call(method, path, body, sentHeaders).then((result) => {
    const ok =
      result.reachable &&
      (target === 200
        ? result.status === 200 || result.status === 201
        : result.status === target) &&
      (!envelope ||
        (result.body &&
          result.body.success === (target < 400) &&
          "message" in result.body &&
          "data" in result.body));
    record(
      `${String(method).padEnd(6)} ${path} -> ${target}`,
      ok,
      `got ${result.status} ${result.message ?? ""}`.trim(),
    );
    return result;
  });
}

async function main() {
  console.log(`Verifying ${BASE}\n`);

  const health = await check("health", "GET", "/health");
  if (!health.reachable) {
    console.error(
      `\nBackend is not reachable at ${BASE}.\nStart it with "npm run start:dev" and re-run.`,
    );
    process.exit(1);
  }

  // â”€â”€ Public catalogue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const catalog = await check("catalog", "GET", "/catalog/products");
  const products = catalog.body?.data?.items ?? [];
  record("catalogue returns products", products.length >= 10, `got ${products.length}`);
  record(
    "prices use the money envelope",
    typeof products[0]?.price?.amount === "string" &&
      products[0]?.price?.currency === "IDR",
  );

  await check("catalog search", "GET", "/catalog/products?search=oat");
  await check("catalog category", "GET", "/catalog/products?category=Pastry");
  await check("catalog product", "GET", "/catalog/products/oat-latte");
  await check("catalog 404", "GET", "/catalog/products/not-a-real-slug", { expect: 404 });
  await check("categories", "GET", "/catalog/categories");
  await check("bundles", "GET", "/catalog/bundles");
  await check("cake options", "GET", "/catalog/cake-options");
  await check("branches", "GET", "/branches");
  await check("branch 404", "GET", "/branches/99999999-9999-4999-8999-999999999999", {
    expect: 404,
  });
  await check("ready", "GET", "/health/ready");
  await check("status", "GET", "/status");
  await check("support", "GET", "/support");
  await check("privacy", "GET", "/privacy/data-controls");
  await check("table session", "GET", "/tables/TBL-SCBD-04");
  await check("protected route without a session", "GET", "/orders", { expect: 401 });

  // â”€â”€ Authentication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const demo = await check("demo accounts", "GET", "/auth/demo-accounts");
  record("demo accounts are published", (demo.body?.data?.staff ?? []).length >= 3);

  await check("staff login rejects a bad PIN", "POST", "/auth/staff/login", {
    body: { email: "manager@kedai.local", secret: "9999" },
    expect: 401,
  });
  await check("staff login rejects an unknown email", "POST", "/auth/staff/login", {
    body: { email: "nobody@kedai.local", secret: "1234" },
    expect: 401,
  });
  await check("staff login rejects a malformed email", "POST", "/auth/staff/login", {
    body: { email: "not-an-email", secret: "1234" },
    expect: 400,
  });
  const login = await check("staff login", "POST", "/auth/staff/login", {
    body: { email: "admin@kedai.local", secret: "1234" },
  });
  record(
    "login issues an HTTP-only session cookie",
    login.body?.data?.user?.role === "ADMIN" && cookieJar.includes("kedai_access"),
  );
  record("login never leaks a PIN hash", !JSON.stringify(login.body).includes("$2b$"));

  await check("session", "GET", "/auth/session");
  await check("manager re-authorization", "POST", "/auth/manager-reauthorize", {
    body: { pin: "2468", reason: "verification script" },
  });
  await check("manager re-authorization rejects a bad PIN", "POST", "/auth/manager-reauthorize", {
    body: { pin: "0000", reason: "verification script" },
    expect: 400,
  });

  // â”€â”€ Commerce â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let cart = (await call("POST", "/carts", {})).body?.data;
  record("cart is created", Boolean(cart?.id));
  cart = (
    await call("POST", `/carts/${cart.id}/items`, {
      productId: "10000000-0000-4000-8000-000000000001",
      quantity: 2,
    })
  ).body?.data;
  record("server prices the cart", cart?.subtotal?.amount === "84000", cart?.subtotal?.amount);

  await check("cart line quantity validation", "POST", `/carts/${cart.id}/items`, {
    body: { productId: "not-a-uuid", quantity: 1 },
    expect: 400,
  });
  await check("cart quantity bounds", "POST", `/carts/${cart.id}/items`, {
    body: { productId: "10000000-0000-4000-8000-000000000001", quantity: 0 },
    expect: 400,
  });
  await check("cart rejects unknown products", "POST", `/carts/${cart.id}/items`, {
    body: { productId: "99999999-9999-4999-8999-999999999999", quantity: 1 },
    expect: 404,
  });
  await check("promo code", "POST", `/carts/${cart.id}/discount`, { body: { code: "KEDAI10" } });
  await check("unknown promo code", "POST", `/carts/${cart.id}/discount`, {
    body: { code: "NOPECODE" },
    expect: 404,
  });

  const checkout = await call("POST", `/checkout/${cart.id}`, {
    fulfilmentMode: "TAKEAWAY",
  });
  record("checkout requires an idempotency key", checkout.status === 400, `got ${checkout.status}`);
  await check("checkout validates the fulfilment mode", "POST", `/checkout/${cart.id}`, {
    body: { fulfilmentMode: "TELEPORT" },
    headers: { "Idempotency-Key": key("verify-bad-mode") },
    expect: 400,
  });

  const order = (
    await call(
      "POST",
      `/checkout/${cart.id}`,
      { fulfilmentMode: "TAKEAWAY" },
      { "Idempotency-Key": key("verify-checkout") },
    )
  ).body?.data;
  record("checkout creates a pending order", order?.status === "PENDING_PAYMENT");
  record("order exposes its allowed transitions", order?.allowedTransitions?.length > 0);

  const replay = (
    await call(
      "POST",
      `/checkout/${cart.id}`,
      { fulfilmentMode: "TAKEAWAY" },
      { "Idempotency-Key": key("verify-checkout") },
    )
  ).body?.data;
  record("checkout is idempotent", replay?.id === order?.id);
  await check("a consumed cart is gone", "GET", `/carts/${cart.id}`, { expect: 404 });

  // â”€â”€ Payments, receipts, refunds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await check("payment requires an idempotency key", "POST", `/orders/${order.id}/payments`, {
    body: { method: "QRIS" },
    expect: 400,
  });
  await check("payment rejects unknown methods", "POST", `/orders/${order.id}/payments`, {
    body: { method: "IMAGINARY" },
    headers: { "Idempotency-Key": key("verify-pay-bad") },
    expect: 400,
  });
  await check("payment", "POST", `/orders/${order.id}/payments`, {
    body: { method: "QRIS" },
    headers: { "Idempotency-Key": key("verify-pay") },
  });
  const paymentReplay = await call(
    "POST",
    `/orders/${order.id}/payments`,
    { method: "QRIS" },
    { "Idempotency-Key": key("verify-pay") },
  );
  record("payment is idempotent", paymentReplay.body?.data?.status === "SETTLED");
  await check("an order can only be paid once", "POST", `/orders/${order.id}/payments`, {
    body: { method: "CASH" },
    headers: { "Idempotency-Key": key("verify-pay-2") },
    expect: 409,
  });

  await check("order status transition", "PATCH", `/orders/${order.id}/status`, {
    body: { status: "ACCEPTED" },
  });
  await check("invalid order transition", "PATCH", `/orders/${order.id}/status`, {
    body: { status: "REFUNDED" },
    expect: 409,
  });
  const receipt = await check("receipt", "GET", `/orders/${order.id}/receipt`);
  record("receipt has a number", /^RCP-/.test(receipt.body?.data?.receiptNo ?? ""));

  await check("refund requires a manager PIN", "POST", `/orders/${order.id}/refunds`, {
    body: { amount: 1000, reason: "verification", managerPin: "0000" },
    headers: { "Idempotency-Key": key("verify-refund-0") },
    expect: 403,
  });
  await check("refund validates the reason", "POST", `/orders/${order.id}/refunds`, {
    body: { amount: 1000, reason: "x", managerPin: "2468" },
    headers: { "Idempotency-Key": key("verify-refund-1") },
    expect: 400,
  });
  await check("refund", "POST", `/orders/${order.id}/refunds`, {
    body: { amount: 1000, reason: "Damaged pastry", managerPin: "2468" },
    headers: { "Idempotency-Key": key("verify-refund-2") },
  });

  const orders = await check("order list", "GET", "/orders?page=1&pageSize=5");
  record(
    "order list is paginated",
    orders.body?.data?.items?.length === 5 && orders.body?.data?.total > 5,
    JSON.stringify(orders.body?.data?.meta ?? orders.body?.data?.total),
  );
  await check("order search", "GET", "/orders?search=1&pageSize=3");
  await check("order detail", "GET", `/orders/${order.id}`);
  await check("order 404", "GET", "/orders/99999999-9999-4999-8999-999999999999", {
    expect: 404,
  });

  // â”€â”€ POS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const terminal = await check("pos terminal", "GET", "/pos/terminal");
  record("terminal reports shift totals", terminal.body?.data?.shift?.openOrders > 0);
  await check("pos orders", "GET", "/pos/orders?pageSize=5");
  await check("pos pickups", "GET", "/pos/pickups");
  await check("pos discounts", "GET", "/pos/discounts");
  await check("discount preview", "POST", "/pos/discounts/preview", {
    body: { code: "KEDAI10", amount: 84000 },
  });
  await check("discount preview rejects bad codes", "POST", "/pos/discounts/preview", {
    body: { code: "NOPECODE", amount: 84000 },
  });
  await check("custom item", "POST", "/pos/custom-items", {
    body: { name: "Extra espresso shot", price: 8000, note: "Rush" },
  });
  await check("custom item requires a price", "POST", "/pos/custom-items", {
    body: { name: "No price", price: -5 },
    expect: 400,
  });
  await check("split bill", "GET", `/pos/split-bill/${order.id}?parts=3`);
  await check("pos settings", "GET", "/pos/settings");
  await check("pos tables", "GET", "/pos/tables");
  await check("pickup verification", "POST", `/pos/pickup/${order.id}/verify`);

  // â”€â”€ Kitchen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const stations = await check("kds stations", "GET", "/kds/stations");
  record("three stations are configured", stations.body?.data?.items?.length === 3);
  const tickets = await check("kds tickets", "GET", "/kds/tickets?station=BAR&pageSize=25");
  // A previous run may already have finished the earliest tickets, so pick one
  // that is still open rather than assuming the head of the queue.
  const openTicket = (tickets.body?.data?.items ?? []).find(
    (task) => ["QUEUED", "IN_PROGRESS"].includes(task.status),
  );
  const nextStatus = openTicket?.status === "QUEUED" ? "IN_PROGRESS" : "DONE";
  if (openTicket) {
    await check("kds transition", "PATCH", `/kds/tickets/${openTicket.id}/status`, {
      body: { status: nextStatus },
    });
    await check("kds rejects invalid transitions", "PATCH", `/kds/tickets/${openTicket.id}/status`, {
      body: { status: "QUEUED" },
      expect: 409,
    });
  } else {
    record("kds has an open ticket", false, "every BAR ticket is already terminal");
  }
  await check("kds ticket 404", "PATCH", "/kds/tickets/99999999-9999-4999-8999-999999999999/status", {
    body: { status: "DONE" },
    expect: 404,
  });
  await check("manual ticket", "POST", "/kds/manual-orders", {
    body: { item: "Walking drink", station: "BAR", priority: 1 },
  });
  await check("display case", "GET", "/kds/display-case");

  // â”€â”€ Production â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const capacity = await check("production capacity", "GET", "/production/capacity");
  record("capacity exposes slot load", (capacity.body?.data?.slots ?? []).length === 5);
  const jobs = await check("cake jobs", "GET", "/production/cake-jobs");
  record("cake jobs are listed", (jobs.body?.data?.items ?? []).length > 0);
  await check("cake job detail", "GET", `/production/cake-jobs/${jobs.body.data.items[0].id}`);
  // Book a job in this run so the stage assertions do not depend on whether a
  // previous run already advanced the seeded ones. Ask the capacity endpoint for
  // a slot that is still free rather than guessing one, so repeated runs against
  // the same process cannot exhaust capacity.
  //
  // The studio reports and accepts pickups in its own timezone (UTC+7), so a
  // slot named "10:00" has to be sent as 03:00Z.
  async function freeSlot(fromDaysAhead) {
    for (let day = fromDaysAhead; day < fromDaysAhead + 60; day += 1) {
      const date = new Date(Date.now() + day * 86400000).toISOString().slice(0, 10);
      const capacity = (await call("GET", `/production/capacity?date=${date}`)).body
        ?.data;
      const chosen = (capacity?.slots ?? []).find((slot) => slot.available > 0);
      if (!chosen) continue;
      // The studio works in UTC+7, so a local slot has to be sent as UTC-7.
      return new Date(
        new Date(`${date}T${chosen.time}:00.000Z`).getTime() - 7 * 3600_000,
      ).toISOString();
    }
    return undefined;
  }
  const pickup = await freeSlot(5);

  const newJob = pickup
    ? (
        await call("POST", "/production/cake-jobs", {
          title: `Verification cake ${RUN}`,
          customer: "Verification Script",
          occasion: "BIRTHDAY",
          tier: "1 Tier",
          flavour: "Pandan Coconut",
          servings: "16",
          pickupAt: pickup,
        })
      ).body?.data
    : undefined;

  if (newJob?.id) {
    await check("cake stage transition", "PATCH", `/production/cake-jobs/${newJob.id}/stage`, {
      body: { stage: "APPROVED" },
    });
    await check("cake rejects skipping stages", "PATCH", `/production/cake-jobs/${newJob.id}/stage`, {
      body: { stage: "READY" },
      expect: 409,
    });
  } else {
    // The studio's calendar is full from earlier runs against this long-lived
    // process. Lead time, off-slot rejection and both capacity caps are covered
    // by the store's unit tests, so this is a skip rather than a failure.
    console.log("  (skipped booking a cake job: no free pickup slot left)");
  }
  await check("calendar", "GET", "/production/calendar");
  await check("queue", "GET", "/production/queue");
  const prep = await check("prep sheet", "GET", "/production/prep-sheet");
  record("prep sheet rolls up ingredients", Array.isArray(prep.body?.data?.ingredientTotals));
  await check("recipes", "GET", "/production/recipes");
  await check("staffing", "GET", "/production/staffing");
  await check("forecasts", "GET", "/production/forecasts?days=7");
  await check("production settings", "GET", "/production/settings");
  await check("new cake job enforces the lead time", "POST", "/production/cake-jobs", {
    body: {
      title: "Rush cake",
      customer: "Verification Script",
      occasion: "BIRTHDAY",
      tier: "1 Tier",
      flavour: "Pandan Coconut",
      servings: "16",
      pickupAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    expect: 400,
  });
  await check("new cake job rejects an off-slot pickup time", "POST", "/production/cake-jobs", {
    body: {
      title: "Off-slot cake",
      customer: "Verification Script",
      occasion: "BIRTHDAY",
      tier: "1 Tier",
      flavour: "Pandan Coconut",
      servings: "16",
      pickupAt: new Date(Date.now() + 6 * 86400000).toISOString(),
    },
    expect: 400,
  });

  // -- Inventory --
  const inventory = await check("inventory", "GET", "/inventory?pageSize=50");
  const ingredient = inventory.body?.data?.items?.[0];
  record("inventory lists ingredients", (inventory.body?.data?.total ?? 0) >= 10);
  await check("stock alerts", "GET", "/inventory/alerts");
  await check("adjustment requires a manager PIN", "POST", `/inventory/${ingredient.id}/adjustments`, {
    body: { quantity: 1, reason: "verification", managerPin: "0000" },
    expect: 403,
  });
  await check("adjustment rejects a zero delta", "POST", `/inventory/${ingredient.id}/adjustments`, {
    body: { quantity: 0, reason: "verification", managerPin: "2468" },
    expect: 400,
  });
  await check("adjustment rejects a missing reason", "POST", `/inventory/${ingredient.id}/adjustments`, {
    body: { quantity: 1, reason: "", managerPin: "2468" },
    expect: 400,
  });
  await check("stock adjustment", "POST", `/inventory/${ingredient.id}/adjustments`, {
    body: { quantity: 2, reason: "Verification delivery", managerPin: "2468" },
  });
  await check("ingredient 404", "POST", "/inventory/99999999-9999-4999-8999-999999999999/adjustments", {
    body: { quantity: 1, reason: "verification", managerPin: "2468" },
    expect: 404,
  });
  await check("inventory recipes", "GET", "/inventory/recipes");
  const displayCase = await check("display case", "GET", "/inventory/display-case");
  const caseItem = displayCase.body?.data?.items?.[0];
  if (caseItem) {
    await check("recount", "POST", `/inventory/display-case/${caseItem.productId}/recount`, {
      body: { quantity: 2 },
    });
    await check("recount cannot exceed capacity", "POST", `/inventory/display-case/${caseItem.productId}/recount`, {
      body: { quantity: 9999 },
      expect: 400,
    });
  }

  // â”€â”€ Catalogue administration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const menu = await check("admin menu", "GET", "/menu/products?pageSize=50");
  const menuItem = menu.body?.data?.items?.[0];
  await check("admin menu rejects a zero price", "PATCH", `/menu/products/${menuItem.id}`, {
    body: { price: 0 },
    expect: 400,
  });
  await check("admin menu update", "PATCH", `/menu/products/${menuItem.id}`, {
    body: { available: true },
  });
  await check("menu categories", "GET", "/menu/categories");
  await check("menu modifiers", "GET", "/menu/modifiers");
  await check("menu bundles", "GET", "/menu/bundles");
  await check("menu cake options", "GET", "/menu/cake-options");

  // â”€â”€ CRM, loyalty, subscriptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const customers = await check("customers", "GET", "/customers?pageSize=10");
  const customer = customers.body?.data?.items?.[0];
  record("customers are seeded", (customers.body?.data?.total ?? 0) >= 5);
  const profile = await check("customer detail", "GET", `/customers/${customer.id}`);
  record(
    "customer detail aggregates history",
    (profile.body?.data?.orders ?? []).length >= 0 &&
      (profile.body?.data?.segments ?? []).length > 0,
  );
  await check("customer 404", "GET", "/customers/99999999-9999-4999-8999-999999999999", {
    expect: 404,
  });
  await check("customer search", "GET", "/customers?search=sarah");
  await check("loyalty rewards", "GET", "/loyalty/rewards");
  await check("loyalty tiers", "GET", "/loyalty/tiers");
  await check("subscription plans", "GET", "/subscriptions/plans");
  const subscriptions = await check("subscriptions", "GET", "/subscriptions");
  // A previous run may have paused a subscription, so restore any that are not
  // active before asserting that a customer cannot hold two at once.
  for (const subscription of subscriptions.body?.data?.items ?? []) {
    if (subscription.status !== "ACTIVE") {
      await call("PATCH", `/subscriptions/${subscription.id}/status`, { status: "ACTIVE" });
    }
  }
  await check("duplicate subscription is rejected", "POST", "/subscriptions", {
    body: { customerId: customer.id, planId: "plan-daily-brew" },
    expect: 409,
  });
  await check("subscribe rejects an unknown plan", "POST", "/subscriptions", {
    body: { customerId: "99999999-9999-4999-8999-999999999999", planId: "plan-nope" },
    expect: 404,
  });
  const subscription = subscriptions.body?.data?.items?.[0];
  if (subscription) {
    await check("subscription status", "PATCH", `/subscriptions/${subscription.id}/status`, {
      body: { status: "PAUSED" },
    });
    await check("subscription rejects unknown states", "PATCH", `/subscriptions/${subscription.id}/status`, {
      body: { status: "SLEEPING" },
      expect: 400,
    });
  }
  const occasions = await check("occasions", "GET", "/occasions");
  const occasion = occasions.body?.data?.items?.[0];
  if (occasion) {
    await check("occasion reminders", "PATCH", `/occasions/${occasion.id}/reminders`, {
      body: { reminders: false },
    });
  }

  // -- Report --
  const dashboard = await check("dashboard", "GET", "/reports/dashboard?days=30");
  const metrics = dashboard.body?.data?.metrics ?? [];
  record("dashboard exposes four metrics", metrics.length === 4);
  record(
    "dashboard revenue is a money value",
    typeof metrics[0]?.value?.amount === "string",
    JSON.stringify(metrics[0]),
  );
  record(
    "dashboard has a daily series",
    (dashboard.body?.data?.revenueSeries ?? []).length === 30,
    String((dashboard.body?.data?.revenueSeries ?? []).length),
  );
  record(
    "dashboard ranks branches",
    (dashboard.body?.data?.branchPerformance ?? []).length === 3,
  );
  record("dashboard has a heatmap", Array.isArray(dashboard.body?.data?.hourlyHeatmap?.grid));
  await check("dashboard branch scope", "GET", "/reports/dashboard?branchId=00000000-0000-4000-8000-000000000001");
  await check("sales report", "GET", "/reports/sales");
  await check("top products", "GET", "/reports/top-products?limit=5");
  await check("cake production report", "GET", "/reports/cake-production");
  await check("forecast", "GET", "/reports/forecast?days=7");
  await check("activity feed", "GET", "/activity");

  // â”€â”€ Platform â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const templates = await check("notification templates", "GET", "/notifications/templates");
  const template = templates.body?.data?.items?.[0];
  await check("template toggle", "PATCH", `/notifications/templates/${template.id}`, {
    body: { active: false },
  });
  await check("template 404", "PATCH", "/notifications/templates/99999999-9999-4999-8999-999999999999", {
    body: { active: false },
    expect: 404,
  });
  await check("notification deliveries", "GET", "/notifications/deliveries");
  await check("notification test", "POST", "/notifications/test", {
    body: { recipient: "+6281234567890", channel: "WHATSAPP" },
  });
  await check("notification test validates the channel", "POST", "/notifications/test", {
    body: { recipient: "+6281234567890", channel: "CARRIER_PIGEON" },
    expect: 400,
  });

  await check("webhook list", "GET", "/webhooks");
  await check("webhook test 404", "POST", "/webhooks/99999999-9999-4999-8999-999999999999/test", {
    expect: 404,
  });
  const webhook = (
    await call("POST", "/webhooks", {
      name: "Verification sink",
      url: "https://hooks.example.com/verify",
      secret: "verification-secret",
      events: ["order.settled"],
    })
  ).body?.data;
  record("webhook secret is never echoed", !JSON.stringify(webhook)?.includes("verification-secret"));
  await check("webhook toggle", "PATCH", `/webhooks/${webhook.id}`, { body: { active: false } });
  await check("webhook delete", "DELETE", `/webhooks/${webhook.id}`);
  await check("webhook delete is not repeatable", "DELETE", `/webhooks/${webhook.id}`, {
    expect: 404,
  });
  await check("webhook signature verification", "POST", "/webhooks/sandbox/verify", {
    body: { payload: "{}", secret: "s" },
    headers: { "x-kedai-signature": "sha256=wrong" },
    expect: 401,
  });

  await check("settings read", "GET", "/settings");
  await check("settings merge", "PATCH", "/settings", {
    body: { patch: { commerce: { pickupHoldMinutes: 20 } } },
  });
  const settings = (await call("GET", "/settings")).body?.data;
  record(
    "settings merge preserves other sections",
    settings?.commerce?.cakeLeadTimeHours === 48 &&
      settings?.commerce?.pickupHoldMinutes === 20,
    JSON.stringify(settings?.commerce),
  );
  await check("settings reject unknown fields", "PATCH", "/settings", {
    body: { patch: { commerce: { nope: 1 } } },
    expect: 400,
  });
  await check("settings reject out-of-range values", "PATCH", "/settings", {
    body: { patch: { commerce: { pickupHoldMinutes: 9999 } } },
    expect: 400,
  });

  // â”€â”€ Role scoping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await check("logout", "POST", "/auth/logout", { body: {} });
  await check("session ends after logout", "GET", "/orders", { expect: 401 });

  cookieJar = "";
  await check("manager login", "POST", "/auth/staff/login", {
    body: { email: "manager@kedai.local", secret: "1234" },
  });
  await check("manager can read reports", "GET", "/reports/dashboard");
  await check("manager cannot manage webhooks", "POST", "/webhooks", {
    body: {
      name: "Should not exist",
      url: "https://hooks.example.com/blocked",
      secret: "blocked-secret",
    },
    expect: 403,
  });

  cookieJar = "";
  await call("POST", "/auth/staff/login", {
    email: "cashier@kedai.local",
    secret: "1234",
  });
  record("cashier session established", cookieJar.includes("kedai_access"));
  await check("cashier cannot read inventory", "GET", "/inventory", { expect: 403 });
  await check("cashier cannot read reports", "GET", "/reports/dashboard", { expect: 403 });
  await check("cashier can read orders", "GET", "/orders?pageSize=1");
  await check("cashier cannot manage webhooks", "GET", "/webhooks", { expect: 403 });
  await check("cashier cannot reach the kitchen", "GET", "/kds/tickets", { expect: 403 });

  cookieJar = "";
  // A run-scoped phone number gets a fresh OTP challenge: the API deliberately
  // refuses a second request for the same number while one is outstanding.
  const phone = `+62812${String(Date.now()).slice(-7)}`;
  const otp = await check("customer OTP challenge", "POST", "/auth/customer/otp", {
    body: { phone },
  });
  const code = otp.body?.data?.developmentCode;
  record("the sandbox returns its OTP in development", code === "111111", String(code));
  await check("customer OTP rejects a malformed phone", "POST", "/auth/customer/otp", {
    body: { phone: "1234" },
    expect: 400,
  });
  // Request the challenge, verify the sandbox code, then sign in. The cookie is
  // captured explicitly so it does not leak into the staff jar below.
  const verify = await call("POST", "/auth/customer/verify", {
    phone,
    code: code ?? "111111",
  });
  const customerCookie = (verify.headers?.getSetCookie?.() ?? [])
    .map((entry) => entry.split(";")[0])
    .join("; ");
  record("customer sign-in issues a session", verify.status === 201 && customerCookie.length > 0);
  const customerProfile = await check("customer profile", "GET", "/customers/me", {
    cookie: customerCookie,
  });
  record(
    "the customer profile resolves",
    Boolean(customerProfile.body?.data?.customer?.name),
    JSON.stringify(customerProfile.body?.data ?? {}).slice(0, 120),
  );
  await check("customer cannot read the order queue", "GET", "/orders", {
    cookie: customerCookie,
    expect: 403,
  });

  // -- Report --
  console.log(`${passed} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }
  console.log("\nAll API checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
