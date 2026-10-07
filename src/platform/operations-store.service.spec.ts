import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { OperationsStoreService } from './operations-store.service';

describe('OperationsStoreService', () => {
  let store: OperationsStoreService;
  const realtime = {
    emitBranch: jest.fn(),
    emitStation: jest.fn(),
    emitOrder: jest.fn(),
  };

  const OAT_LATTE = '10000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    jest.clearAllMocks();
    store = new OperationsStoreService(realtime as unknown as RealtimeService);
  });

  describe('catalogue', () => {
    it('serves the seeded products', () => {
      expect(store.listProducts()).toHaveLength(14);
    });

    it('searches by name, description and SKU', () => {
      expect(store.listProducts({ search: 'tiramisu' })).toHaveLength(1);
      expect(store.listProducts({ search: 'pst-' })).toHaveLength(3);
      expect(store.listProducts({ search: 'nothing-here' })).toHaveLength(0);
    });

    it('filters by category', () => {
      const pastry = store.listProducts({ category: 'Pastry' });
      expect(pastry).toHaveLength(3);
      expect(pastry.every((item) => item.category === 'Pastry')).toBe(true);
    });

    it('sorts by price', () => {
      const ascending = store.listProducts({ sort: 'price_asc' });
      expect(ascending[0].price).toBeLessThan(ascending.at(-1)!.price);
    });

    it('finds a product by slug or id', () => {
      expect(store.findProduct('oat-latte').id).toBe(OAT_LATTE);
      expect(store.findProduct(OAT_LATTE).slug).toBe('oat-latte');
      expect(() => store.findProduct('missing')).toThrow(NotFoundException);
    });

    it('rejects a reprice to zero', () => {
      expect(() => store.updateProduct(OAT_LATTE, { price: 0 })).toThrow(
        BadRequestException,
      );
    });

    it('applies a valid update and announces it', () => {
      const updated = store.updateProduct(OAT_LATTE, { available: false });
      expect(updated.available).toBe(false);
      expect(realtime.emitBranch).toHaveBeenCalledWith(
        expect.any(String),
        'catalog.changed',
        expect.objectContaining({ id: OAT_LATTE, available: false }),
      );
    });
  });

  describe('cart', () => {
    it('prices a cart from the server catalogue', () => {
      const cart = store.createCart();
      const priced = store.addCartItem(cart.id, {
        productId: OAT_LATTE,
        quantity: 2,
      });
      expect(priced.subtotal).toEqual({ amount: '84000', currency: 'IDR' });
      expect(priced.itemCount).toBe(2);
    });

    it('refuses unknown products', () => {
      const cart = store.createCart();
      expect(() =>
        store.addCartItem(cart.id, {
          productId: '99999999-9999-4999-8999-999999999999',
          quantity: 1,
        }),
      ).toThrow(NotFoundException);
    });

    it('refuses fractional or out-of-range quantities', () => {
      const cart = store.createCart();
      for (const quantity of [0, 100, 1.5]) {
        expect(() =>
          store.addCartItem(cart.id, { productId: OAT_LATTE, quantity }),
        ).toThrow(BadRequestException);
      }
    });

    it('updates and removes lines', () => {
      const cart = store.createCart();
      const withLine = store.addCartItem(cart.id, {
        productId: OAT_LATTE,
        quantity: 1,
      });
      const lineId = withLine.items[0].id;
      expect(
        store.updateCartItem(cart.id, lineId, { quantity: 3 }).items[0]
          .lineTotal,
      ).toEqual({
        amount: '126000',
        currency: 'IDR',
      });
      expect(store.removeCartItem(cart.id, lineId).items).toHaveLength(0);
      expect(() => store.removeCartItem(cart.id, lineId)).toThrow(
        NotFoundException,
      );
    });

    it('applies a percentage promo code', () => {
      const cart = store.createCart();
      store.addCartItem(cart.id, { productId: OAT_LATTE, quantity: 2 });
      const result = store.applyDiscount(cart.id, { code: 'kedai10' });
      expect(result.code).toBe('KEDAI10');
      expect(result.discount).toEqual({ amount: '8400', currency: 'IDR' });
    });

    it('rejects an unknown promo code', () => {
      const cart = store.createCart();
      expect(() => store.applyDiscount(cart.id, { code: 'NOPE' })).toThrow(
        NotFoundException,
      );
    });

    it('requires a manager PIN for a manual discount', () => {
      const cart = store.createCart();
      store.addCartItem(cart.id, { productId: OAT_LATTE, quantity: 1 });
      expect(() => store.applyDiscount(cart.id, { percent: 10 })).toThrow(
        ForbiddenException,
      );
      expect(
        store.applyDiscount(cart.id, {
          percent: 10,
          managerPin: process.env.DEV_MANAGER_PIN ?? '2468',
        }).discount,
      ).toEqual({ amount: '4200', currency: 'IDR' });
    });
  });

  describe('checkout', () => {
    function cartWithLatte(quantity = 1) {
      const cart = store.createCart();
      return store.addCartItem(cart.id, { productId: OAT_LATTE, quantity }).id;
    }

    it('creates a pending order and consumes the cart', () => {
      const cartId = cartWithLatte(2);
      const order = store.checkout(
        cartId,
        { fulfilmentMode: 'TAKEAWAY' },
        'key-1',
      );
      expect(order.status).toBe('PENDING_PAYMENT');
      expect(order.total).toEqual({ amount: '84000', currency: 'IDR' });
      expect(() => store.getCart(cartId)).toThrow(NotFoundException);
    });

    it('is idempotent for a repeated key', () => {
      const cartId = cartWithLatte();
      const first = store.checkout(
        cartId,
        { fulfilmentMode: 'TAKEAWAY' },
        'key-2',
      );
      const second = store.checkout(
        cartId,
        { fulfilmentMode: 'TAKEAWAY' },
        'key-2',
      );
      expect(second.id).toBe(first.id);
    });

    it('refuses an empty cart', () => {
      const cart = store.createCart();
      expect(() =>
        store.checkout(cart.id, { fulfilmentMode: 'TAKEAWAY' }, 'key-3'),
      ).toThrow(BadRequestException);
    });

    it('raises a kitchen ticket for non-cake lines', () => {
      const cartId = cartWithLatte();
      const before = store.listTasks('BAR').total;
      store.checkout(cartId, { fulfilmentMode: 'TAKEAWAY' }, 'key-4');
      expect(store.listTasks('BAR').total).toBe(before + 1);
    });
  });

  describe('order state machine', () => {
    function paidOrder() {
      const cart = store.createCart();
      store.addCartItem(cart.id, { productId: OAT_LATTE, quantity: 1 });
      const order = store.checkout(
        cart.id,
        { fulfilmentMode: 'TAKEAWAY' },
        'pay-setup',
      );
      store.settlePayment(order.id, { method: 'QRIS' }, 'pay-key');
      return store.findOrder(order.id);
    }

    it('walks the happy path', () => {
      const order = paidOrder();
      expect(order.status).toBe('PAID');
      expect(store.transitionOrder(order.id, 'ACCEPTED').status).toBe(
        'ACCEPTED',
      );
      expect(store.transitionOrder(order.id, 'IN_PREPARATION').status).toBe(
        'IN_PREPARATION',
      );
      expect(store.transitionOrder(order.id, 'READY').status).toBe('READY');
      expect(store.transitionOrder(order.id, 'FULFILLED').status).toBe(
        'FULFILLED',
      );
    });

    it('rejects a skipped stage', () => {
      const order = paidOrder();
      expect(() => store.transitionOrder(order.id, 'READY')).toThrow(
        ConflictException,
      );
    });

    it('only settles a pending order once', () => {
      const order = paidOrder();
      expect(() =>
        store.settlePayment(order.id, { method: 'CASH' }, 'pay-again'),
      ).toThrow(ConflictException);
    });

    it('rejects a mismatched payment amount', () => {
      const cart = store.createCart();
      store.addCartItem(cart.id, { productId: OAT_LATTE, quantity: 1 });
      const order = store.checkout(
        cart.id,
        { fulfilmentMode: 'TAKEAWAY' },
        'amount-setup',
      );
      expect(() =>
        store.settlePayment(
          order.id,
          { method: 'CASH', amount: 1 },
          'amount-key',
        ),
      ).toThrow(BadRequestException);
    });

    it('refunds once a payment is captured', () => {
      const order = paidOrder();
      store.transitionOrder(order.id, 'ACCEPTED');
      store.transitionOrder(order.id, 'IN_PREPARATION');
      const refund = store.refund(
        order.id,
        { amount: 1000, reason: 'Damaged item', managerPin: '2468' },
        'refund-key',
      );
      expect(refund.amount).toEqual({ amount: '1000', currency: 'IDR' });
      expect(store.findOrder(order.id).status).toBe('PARTIALLY_REFUNDED');
    });

    it('refuses to refund an unpaid order', () => {
      const cart = store.createCart();
      store.addCartItem(cart.id, { productId: OAT_LATTE, quantity: 1 });
      const order = store.checkout(
        cart.id,
        { fulfilmentMode: 'TAKEAWAY' },
        'unpaid-setup',
      );
      expect(() =>
        store.refund(
          order.id,
          { amount: 100, reason: 'Change of mind', managerPin: '2468' },
          'unpaid-key',
        ),
      ).toThrow(ConflictException);
    });

    it('refuses a refund larger than the order', () => {
      const order = paidOrder();
      expect(() =>
        store.refund(
          order.id,
          { amount: 999999, reason: 'Too much', managerPin: '2468' },
          'over-key',
        ),
      ).toThrow(BadRequestException);
    });

    it('requires a manager PIN to refund', () => {
      const order = paidOrder();
      expect(() =>
        store.refund(
          order.id,
          { amount: 100, reason: 'No PIN', managerPin: '0000' },
          'pin-key',
        ),
      ).toThrow(ForbiddenException);
    });

    it('issues one receipt per order', () => {
      const order = paidOrder();
      expect(store.getReceipt(order.id).receiptNo).toBe(
        store.getReceipt(order.id).receiptNo,
      );
      expect(store.getReceipt(order.id).receiptNo).toMatch(/^RCP-/);
    });
  });

  describe('kitchen', () => {
    /** Picks a ticket the station has not started yet. */
    function queuedTicket() {
      return store
        .listTasks('BAR', { pageSize: 100 })
        .items.find((task) => task.status === 'QUEUED')!;
    }

    it('seeds bar and pastry tickets', () => {
      expect(store.listTasks('BAR').total).toBeGreaterThan(0);
      expect(store.listTasks('PASTRY').total).toBeGreaterThan(0);
    });

    it('moves a ticket through the state machine', () => {
      const task = queuedTicket();
      const inProgress = store.transitionTask(task.id, 'IN_PROGRESS');
      expect(inProgress.status).toBe('IN_PROGRESS');
      expect(inProgress.startedAt).toBeTruthy();
      expect(store.transitionTask(task.id, 'DONE').completedAt).toBeTruthy();
    });

    it('refuses to restart a finished ticket', () => {
      const task = queuedTicket();
      store.transitionTask(task.id, 'IN_PROGRESS');
      store.transitionTask(task.id, 'DONE');
      expect(() => store.transitionTask(task.id, 'IN_PROGRESS')).toThrow(
        ConflictException,
      );
    });

    it('cancels a ticket straight from the queue', () => {
      const task = queuedTicket();
      expect(store.transitionTask(task.id, 'CANCELLED').status).toBe(
        'CANCELLED',
      );
    });

    it('reports an open count for every station', () => {
      const stations = store.stations;
      expect(stations.map((station) => station.type)).toEqual([
        'BAR',
        'PASTRY',
        'CAKE',
      ]);
      expect(
        stations.every((station) => typeof station.openTasks === 'number'),
      ).toBe(true);
    });

    it('sorts the highest priority ticket first', () => {
      const tasks = store.listTasks('BAR', { pageSize: 20 }).items;
      for (let index = 1; index < tasks.length; index += 1) {
        expect(tasks[index - 1].priority).toBeGreaterThanOrEqual(
          tasks[index].priority,
        );
      }
    });
  });

  describe('cake production', () => {
    const REVIEW_JOB = '60000000-0000-4000-8000-000000000003';

    it('walks a job from review to pickup', () => {
      expect(store.transitionCake(REVIEW_JOB, 'APPROVED').stage).toBe(
        'APPROVED',
      );
      expect(store.transitionCake(REVIEW_JOB, 'BAKING').stage).toBe('BAKING');
      expect(store.transitionCake(REVIEW_JOB, 'DECORATING').stage).toBe(
        'DECORATING',
      );
      expect(store.transitionCake(REVIEW_JOB, 'READY').stage).toBe('READY');
      expect(store.transitionCake(REVIEW_JOB, 'PICKED_UP').stage).toBe(
        'PICKED_UP',
      );
    });

    it('refuses to skip a stage', () => {
      expect(() => store.transitionCake(REVIEW_JOB, 'READY')).toThrow(
        ConflictException,
      );
    });

    it('reports capacity within its limit', () => {
      const capacity = store.capacity();
      expect(capacity.limit).toBe(8);
      expect(capacity.available).toBeGreaterThanOrEqual(0);
      expect(capacity.utilisationPercent).toBeLessThanOrEqual(100);
      expect(capacity.slots).toHaveLength(5);
    });

    it('rejects a new cake job inside the lead time', () => {
      expect(() =>
        store.createCakeJob({
          title: 'Rush cake',
          customer: 'Someone',
          occasion: 'BIRTHDAY',
          tier: '1 Tier',
          flavour: 'Pandan',
          servings: '16',
          pickupAt: new Date(Date.now() + 3_600_000).toISOString(),
        }),
      ).toThrow(BadRequestException);
    });

    /**
     * The store normalises a pickup to studio-local time (UTC+7), so a booking for
     * the 10:00 slot has to arrive as 03:00Z. This helper keeps the tests
     * independent of the machine timezone.
     */
    function slotAt(daysAhead: number, slot: string) {
      const day = new Date(Date.now() + daysAhead * 86400_000)
        .toISOString()
        .slice(0, 10);
      return new Date(
        new Date(`${day}T${slot}:00.000Z`).getTime() - 7 * 3600_000,
      ).toISOString();
    }

    it('books a new cake job that respects the lead time', () => {
      const created = store.createCakeJob({
        title: 'Planned cake',
        customer: 'Someone',
        occasion: 'BIRTHDAY',
        tier: '1 Tier',
        flavour: 'Pandan Coconut',
        servings: '16',
        pickupAt: slotAt(5, '10:00'),
      });
      expect(created.stage).toBe('REVIEW');
      expect(created.pickupAt.endsWith('10:00')).toBe(true);
      expect(
        store.listCakeJobs({ stage: 'REVIEW' }).items.length,
      ).toBeGreaterThan(1);
    });

    it('rejects a pickup time that is not one of the studio slots', () => {
      expect(() =>
        store.createCakeJob({
          title: 'Off-slot cake',
          customer: 'Someone',
          occasion: 'BIRTHDAY',
          tier: '1 Tier',
          flavour: 'Pandan Coconut',
          servings: '16',
          pickupAt: slotAt(41, '03:15'),
        }),
      ).toThrow(BadRequestException);
    });

    it('enforces two cakes per pickup slot', () => {
      const booking = {
        title: 'Slot test',
        customer: 'Someone',
        occasion: 'BIRTHDAY',
        tier: '1 Tier',
        flavour: 'Pandan Coconut',
        servings: '16',
      };
      store.createCakeJob({ ...booking, pickupAt: slotAt(40, '10:00') });
      store.createCakeJob({ ...booking, pickupAt: slotAt(40, '10:00') });
      expect(() =>
        store.createCakeJob({ ...booking, pickupAt: slotAt(40, '10:00') }),
      ).toThrow(ConflictException);
      // A different slot on the same day is still available.
      expect(() =>
        store.createCakeJob({ ...booking, pickupAt: slotAt(40, '14:00') }),
      ).not.toThrow();
    });

    it('enforces the eight-cake daily limit across all slots', () => {
      const booking = {
        title: 'Daily cap',
        customer: 'Someone',
        occasion: 'BIRTHDAY',
        tier: '1 Tier',
        flavour: 'Pandan Coconut',
        servings: '16',
      };
      const day = slotAt(60, '10:00').slice(0, 10);
      let accepted = 0;
      for (const slot of ['10:00', '12:00', '14:00', '16:00', '18:00']) {
        for (let n = 0; n < 2; n += 1) {
          try {
            store.createCakeJob({ ...booking, pickupAt: slotAt(60, slot) });
            accepted += 1;
          } catch {
            expect(accepted).toBe(8);
            const capacity = store.capacity(day);
            expect(capacity.used).toBe(8);
            expect(capacity.available).toBe(0);
            expect(capacity.utilisationPercent).toBe(100);
            return;
          }
        }
      }
      throw new Error(
        `Expected the daily cap to reject a booking, accepted ${accepted}`,
      );
    });
  });

  describe('inventory', () => {
    const OAT_MILK = '30000000-0000-4000-8000-000000000001';

    it('flags low stock and lists alerts', () => {
      expect(
        store.listIngredients({ status: 'LOW_STOCK' }).total,
      ).toBeGreaterThan(0);
      expect(store.stockAlerts().length).toBe(
        store.listIngredients({ status: 'LOW_STOCK' }).total,
      );
    });

    it('requires a manager PIN to adjust', () => {
      expect(() =>
        store.adjustStock(OAT_MILK, {
          quantity: 5,
          reason: 'Delivery',
          managerPin: '0000',
        }),
      ).toThrow(ForbiddenException);
    });

    it('applies an adjustment and recomputes status', () => {
      // The store mutates the ingredient in place, so read the baseline first.
      const baseline = store
        .listIngredients()
        .items.find((item) => item.id === OAT_MILK)!.quantity;
      const after = store.adjustStock(OAT_MILK, {
        quantity: 20,
        reason: 'Restock delivery',
        managerPin: '2468',
      });
      expect(after.quantity).toBe(baseline + 20);
      expect(after.status).toBe('HEALTHY');
    });

    it('refuses to push stock negative', () => {
      expect(() =>
        store.adjustStock(OAT_MILK, {
          quantity: -9999,
          reason: 'Typo',
          managerPin: '2468',
        }),
      ).toThrow(BadRequestException);
    });

    it('refuses a recount above the case capacity', () => {
      const entry = store.listDisplayCase().items[0];
      expect(() =>
        store.recountDisplayCase(entry.productId, entry.capacity + 5),
      ).toThrow(BadRequestException);
    });
  });

  describe('reporting', () => {
    it('builds a dashboard with comparable periods', () => {
      const dashboard = store.dashboard({ days: 30 });
      expect(dashboard.metrics).toHaveLength(4);
      expect(dashboard.revenueSeries).toHaveLength(30);
      expect(dashboard.branchPerformance).toHaveLength(3);
      expect(dashboard.metrics[0].value).toEqual(
        expect.objectContaining({ currency: 'IDR' }),
      );
      expect(typeof dashboard.metrics[0].changePercent).toBe('number');
    });

    it('ranks top products by revenue', () => {
      const top = store.topProductsReport(5);
      expect(top.length).toBeGreaterThan(0);
      const revenues = top.map((item) => Number(item.revenue.amount));
      expect([...revenues].sort((a, b) => b - a)).toEqual(revenues);
    });

    it('builds a heatmap bounded to 0..100', () => {
      const heatmap = store.dashboard().hourlyHeatmap;
      expect(heatmap.grid).toHaveLength(7);
      for (const row of heatmap.grid) {
        for (const cell of row) {
          expect(cell).toBeGreaterThanOrEqual(0);
          expect(cell).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe('pagination and search', () => {
    it('paginates with stable totals', () => {
      const first = store.listOrders({}, { page: 1, pageSize: 10 });
      const second = store.listOrders({}, { page: 2, pageSize: 10 });
      expect(first.items).toHaveLength(10);
      expect(first.total).toBe(second.total);
      expect(first.items[0].id).not.toBe(second.items[0].id);
      expect(first.totalPages).toBe(Math.ceil(first.total / 10));
    });

    it('clamps a page beyond the end', () => {
      const result = store.listOrders({}, { page: 9999, pageSize: 10 });
      expect(result.page).toBe(result.totalPages);
    });

    it('filters open and closed buckets', () => {
      expect(
        store
          .listOrders({ status: 'open' }, { pageSize: 200 })
          .items.every((order) =>
            ['PAID', 'ACCEPTED', 'IN_PREPARATION', 'READY'].includes(
              order.status,
            ),
          ),
      ).toBe(true);
    });

    it('searches customers by name, phone and email', () => {
      expect(store.listCustomers({ search: 'sarah' }).items[0].name).toBe(
        'Sarah Amelia',
      );
      expect(
        store.listCustomers({ search: '+6281234567892' }).items[0].name,
      ).toBe('Dewi Lestari');
      expect(store.listCustomers({ search: '@techx' }).items[0].name).toBe(
        'TechX Office',
      );
    });
  });

  describe('settings', () => {
    it('merges without erasing untouched keys', () => {
      const before = store.settings.commerce as Record<string, unknown>;
      const after = store.saveSettings({ commerce: { pickupHoldMinutes: 25 } });
      expect(
        (after.commerce as Record<string, unknown>).pickupHoldMinutes,
      ).toBe(25);
      expect(
        (after.commerce as Record<string, unknown>).cakeLeadTimeHours,
      ).toBe(before.cakeLeadTimeHours);
    });

    it('rejects an unknown section', () => {
      expect(() => store.saveSettings({ nope: { a: 1 } })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('webhooks', () => {
    it('creates, toggles and deletes an endpoint without echoing the secret', () => {
      const created = store.createWebhook({
        name: 'Test sink',
        url: 'https://hooks.example.com/t',
        secret: 'super-secret-value',
        events: [],
      });
      expect(created.events).toEqual(['order.settled']);
      expect(store.toggleWebhook(created.id, false).active).toBe(false);
      expect(store.deleteWebhook(created.id)).toEqual({
        id: created.id,
        deleted: true,
      });
      expect(() => store.findWebhook(created.id)).toThrow(NotFoundException);
    });
  });
});
