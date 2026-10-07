import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { money, type MoneyDto } from '../common/money';
import {
  BRANCHES,
  STATIONS,
  SUBSCRIPTION_PLANS,
  buildDemoDataset,
  type DemoCakeJob,
  type DemoCustomer,
  type DemoKitchenTask,
  type DemoOrder,
  type DemoProduct,
  type DemoTableSession,
} from './demo-data';
import { RealtimeService } from './realtime.service';

export const ORDER_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['ACCEPTED', 'REFUNDED'],
  ACCEPTED: ['IN_PREPARATION', 'CANCELLED'],
  IN_PREPARATION: ['READY'],
  READY: ['FULFILLED'],
  FULFILLED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUNDED'],
};

export const TASK_TRANSITIONS: Record<string, string[]> = {
  QUEUED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DONE', 'CANCELLED'],
};

export const CAKE_TRANSITIONS: Record<string, string[]> = {
  REVIEW: ['APPROVED', 'CANCELLED'],
  APPROVED: ['BAKING', 'CANCELLED'],
  BAKING: ['DECORATING'],
  DECORATING: ['READY'],
  READY: ['PICKED_UP'],
};

/** Statuses from which no money has been captured yet. */
const UNPAID_ORDER_STATUSES = new Set([
  'DRAFT',
  'PENDING_PAYMENT',
  'CANCELLED',
]);

const OPEN_ORDER_STATUSES = new Set([
  'PAID',
  'ACCEPTED',
  'IN_PREPARATION',
  'READY',
]);

const CAKE_CAPACITY_PER_DAY = 8;
const CAKE_SLOT_CAPACITY = 2;

/**
 * The studio only dispatches cakes at these five fixed times, so a booking must
 * name one of them. Validating the time keeps `capacity()` and the booking rule
 * telling the same story: anything not in this list can never be counted in a
 * slot, which would otherwise let the day fill up invisibly.
 */
const CAKE_PICKUP_SLOTS = [
  '10:00',
  '12:00',
  '14:00',
  '16:00',
  '18:00',
] as const;

/**
 * Resolves the `status` filter used across the order surfaces. On top of the
 * concrete statuses it accepts two grouped buckets: `open` (still in the
 * fulfilment flow) and `closed` (everything else, including cancellations).
 */
function matchesOrderStatus(status: string, filter?: string) {
  if (!filter) return true;
  const wanted = filter.trim().toUpperCase();
  if (wanted === 'OPEN') return OPEN_ORDER_STATUSES.has(status);
  if (wanted === 'CLOSED') return !OPEN_ORDER_STATUSES.has(status);
  if (wanted === 'ALL') return true;
  return status === wanted;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Sandbox payment settlement returned by `POST /orders/:id/payments`. */
export interface PaymentResult {
  id: string;
  orderId: string;
  provider: string;
  providerRef: string;
  method: string;
  amount: MoneyDto;
  status: string;
  settledAt: string;
}

/** Refund record returned by `POST /orders/:id/refunds`. */
export interface RefundResult {
  id: string;
  orderId: string;
  ticketNumber: string;
  amount: MoneyDto;
  reason: string;
  status: string;
  createdAt: string;
}

/** The wire representation of an order, used by every order-facing endpoint. */
export interface OrderDto {
  id: string;
  branchId: string;
  branchName: string;
  customerId: string | null;
  customerName: string | null;
  ticketNumber: string;
  fulfilmentMode: string;
  tableLabel: string | null;
  status: string;
  allowedTransitions: string[];
  paymentMethod: string | null;
  refunded: MoneyDto | null;
  note: string | null;
  pickupAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    productId: string;
    name: string;
    station: string;
    quantity: number;
    note: string | null;
    modifiers: string[];
    unitPrice: MoneyDto;
    lineTotal: MoneyDto;
  }>;
  subtotal: MoneyDto;
  discount: MoneyDto;
  tax: MoneyDto;
  total: MoneyDto;
}

interface CartLine {
  id: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  note?: string;
  station: string;
}

interface CartRecord {
  id: string;
  branchId: string;
  customerId?: string;
  tableToken?: string;
  expiresAt: string;
  items: CartLine[];
}

interface ReceiptRecord {
  id: string;
  orderId: string;
  receiptNo: string;
  printedAt: string;
  channel: string;
}

interface DiscountRecord {
  id: string;
  code: string;
  kind: 'PERCENT' | 'FIXED';
  value: number;
  active: boolean;
}

/**
 * Single source of truth for the demo deployment.
 *
 * The dataset is generated deterministically at boot so every surface renders
 * realistic, internally consistent data without requiring a database. All money
 * crosses the wire as `{ amount, currency }`, and every mutation that can be
 * replayed (checkout, payment, refund) is protected by an idempotency key.
 */
@Injectable()
export class OperationsStoreService {
  private readonly data = buildDemoDataset();
  private readonly carts = new Map<string, CartRecord>();
  private readonly receipts = new Map<string, ReceiptRecord>();
  private readonly idempotency = new Map<string, unknown>();
  private readonly customOrders: DemoOrder[] = [];
  private readonly customCakeJobs: DemoCakeJob[] = [];
  private readonly manualTasks: DemoKitchenTask[] = [];

  readonly defaultBranchId = BRANCHES.scbd;

  readonly discounts: DiscountRecord[] = [
    {
      id: 'e1000000-0000-4000-8000-000000000001',
      code: 'KEDAI10',
      kind: 'PERCENT',
      value: 10,
      active: true,
    },
    {
      id: 'e1000000-0000-4000-8000-000000000002',
      code: 'SCBD25',
      kind: 'FIXED',
      value: 25000,
      active: true,
    },
    {
      id: 'e1000000-0000-4000-8000-000000000003',
      code: 'OPENING20',
      kind: 'PERCENT',
      value: 20,
      active: false,
    },
  ];

  constructor(private readonly realtime: RealtimeService) {}

  // â”€â”€ Reference data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  get branches() {
    return this.data.branches;
  }

  get customers() {
    return this.data.customers;
  }

  get settings() {
    return this.data.settings;
  }

  listBranches(includeInactive = false) {
    return this.data.branches.filter(
      (branch) => includeInactive || branch.active,
    );
  }

  findBranch(id: string) {
    const branch = this.data.branches.find((item) => item.id === id);
    if (!branch) throw new NotFoundException('Branch not found.');
    return branch;
  }

  get categories() {
    const seen = new Map<string, { id: string; name: string; slug: string }>();
    for (const product of this.data.products) {
      if (!seen.has(product.categoryId)) {
        seen.set(product.categoryId, {
          id: product.categoryId,
          name: product.category,
          slug: product.category.toLowerCase().replace(/\s+/g, '-'),
        });
      }
    }
    return [...seen.values()];
  }

  listProducts(
    filters: {
      search?: string;
      category?: string;
      categoryId?: string;
      available?: boolean;
      sort?: 'price_asc' | 'price_desc' | 'name_asc';
    } = {},
  ) {
    const query = filters.search?.trim().toLocaleLowerCase('id-ID');
    const items = this.data.products.filter((product) => {
      const matchesQuery =
        !query ||
        product.name.toLocaleLowerCase('id-ID').includes(query) ||
        product.description.toLocaleLowerCase('id-ID').includes(query) ||
        product.sku.toLocaleLowerCase('id-ID').includes(query);
      const matchesCategory =
        !filters.category ||
        product.category.toLocaleLowerCase('id-ID') ===
          filters.category.toLocaleLowerCase('id-ID');
      const matchesCategoryId =
        !filters.categoryId || product.categoryId === filters.categoryId;
      const matchesAvailability =
        filters.available === undefined ||
        product.available === filters.available;
      return (
        matchesQuery &&
        matchesCategory &&
        matchesCategoryId &&
        matchesAvailability
      );
    });

    const sorted = [...items];
    if (filters.sort === 'price_asc') sorted.sort((a, b) => a.price - b.price);
    else if (filters.sort === 'price_desc')
      sorted.sort((a, b) => b.price - a.price);
    else if (filters.sort === 'name_asc')
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }

  findProduct(slugOrId: string): DemoProduct {
    const product = this.data.products.find(
      (item) => item.slug === slugOrId || item.id === slugOrId,
    );
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  updateProduct(
    id: string,
    patch: { name?: string; price?: number; available?: boolean },
  ) {
    const product = this.data.products.find((item) => item.id === id);
    if (!product) throw new NotFoundException('Product not found.');
    if (patch.name?.trim()) product.name = patch.name.trim();
    if (typeof patch.price === 'number') {
      if (patch.price <= 0)
        throw new BadRequestException('Price must be greater than zero.');
      product.price = Math.round(patch.price);
    }
    if (typeof patch.available === 'boolean')
      product.available = patch.available;
    this.realtime.emitBranch(this.defaultBranchId, 'catalog.changed', {
      id: product.id,
      available: product.available,
    });
    return product;
  }

  get modifierGroups() {
    return [
      {
        id: 'group-milk',
        name: 'Milk choice',
        required: false,
        maxSelected: 1,
        options: [
          { id: 'milk-regular', name: 'Regular milk', priceDelta: 0 },
          { id: 'milk-oat', name: 'Oat milk', priceDelta: 8000 },
          { id: 'milk-soy', name: 'Soy milk', priceDelta: 6000 },
          { id: 'milk-almond', name: 'Almond milk', priceDelta: 10000 },
        ],
      },
      {
        id: 'group-temperature',
        name: 'Temperature',
        required: true,
        maxSelected: 1,
        options: [
          { id: 'temp-hot', name: 'Hot', priceDelta: 0 },
          { id: 'temp-iced', name: 'Iced', priceDelta: 0 },
          { id: 'temp-frozen', name: 'Frozen', priceDelta: 3000 },
        ],
      },
      {
        id: 'group-extra-shot',
        name: 'Extra espresso shot',
        required: false,
        maxSelected: 3,
        options: [
          { id: 'shot-1', name: '1 shot', priceDelta: 8000 },
          { id: 'shot-2', name: '2 shots', priceDelta: 16000 },
        ],
      },
      {
        id: 'group-topping',
        name: 'Toppings',
        required: false,
        maxSelected: 2,
        options: [
          { id: 'topping-boba', name: 'Boba', priceDelta: 5000 },
          { id: 'topping-pudding', name: 'Egg pudding', priceDelta: 5000 },
          { id: 'topping-cheese-foam', name: 'Cheese foam', priceDelta: 8000 },
        ],
      },
    ];
  }

  get bundles() {
    const byId = (slug: string) =>
      this.data.products.find((item) => item.slug === slug)!;
    return [
      {
        id: 'bundle-brunch-for-two',
        slug: 'brunch-for-two',
        name: 'Brunch for Two',
        description: 'Two signature drinks plus two pastries, served together.',
        price: 129000,
        compareAtPrice: 148000,
        active: true,
        items: [
          { productId: byId('flat-white').id, name: 'Flat White', quantity: 2 },
          {
            productId: byId('tiramisu-slice').id,
            name: 'Tiramisu Slice',
            quantity: 2,
          },
        ],
      },
      {
        id: 'bundle-birthday-set',
        slug: 'birthday-set',
        name: 'Birthday Set',
        description:
          'A whole pandan cake, four oat lattes, candles and a greeting card.',
        price: 528000,
        compareAtPrice: 548000,
        active: true,
        items: [
          {
            productId: byId('signature-pandan-cake').id,
            name: 'Signature Pandan Cake 18cm',
            quantity: 1,
          },
          { productId: byId('oat-latte').id, name: 'Oat Latte', quantity: 4 },
        ],
      },
      {
        id: 'bundle-office-brunch',
        slug: 'office-brunch',
        name: 'Office Brunch',
        description: 'Ten drinks and a dozen pastries for team meetings.',
        price: 812000,
        compareAtPrice: 906000,
        active: true,
        items: [
          {
            productId: byId('flat-white').id,
            name: 'Flat White',
            quantity: 10,
          },
          {
            productId: byId('kougn-amann').id,
            name: 'Kouign-Amann',
            quantity: 12,
          },
        ],
      },
    ];
  }

  get cakeOptions() {
    return {
      occasions: [
        'BIRTHDAY',
        'ANNIVERSARY',
        'WEDDING',
        'BABY_SHOWER',
        'GRADUATION',
        'CORPORATE',
      ],
      tiers: [
        { id: 'tier-1', tiers: 1, label: '1 Tier', priceDelta: 0 },
        { id: 'tier-2', tiers: 2, label: '2 Tiers', priceDelta: 250000 },
        { id: 'tier-3', tiers: 3, label: '3 Tiers', priceDelta: 600000 },
      ],
      sizes: [
        {
          id: 'size-15',
          label: '15 cm',
          diameterCm: 15,
          servings: '8-10',
          priceDelta: 0,
        },
        {
          id: 'size-18',
          label: '18 cm',
          diameterCm: 18,
          servings: '16-20',
          priceDelta: 60000,
        },
        {
          id: 'size-22',
          label: '22 cm',
          diameterCm: 22,
          servings: '24-30',
          priceDelta: 180000,
        },
        {
          id: 'size-25',
          label: '25 cm',
          diameterCm: 25,
          servings: '30-40',
          priceDelta: 300000,
        },
      ],
      flavours: [
        { id: 'flavour-pandan', name: 'Pandan Coconut', category: 'SPONGE' },
        {
          id: 'flavour-valrhona',
          name: 'Valrhona Dark Chocolate',
          category: 'SPONGE',
        },
        {
          id: 'flavour-vegan-carrot',
          name: 'Vegan Carrot',
          category: 'SPONGE',
        },
        { id: 'flavour-matcha', name: 'Matcha Red Bean', category: 'SPONGE' },
      ],
      finishes: [
        { id: 'finish-smooth', name: 'Smooth cream' },
        { id: 'finish-textured', name: 'Textured cream' },
        { id: 'finish-semi-naked', name: 'Semi-naked' },
        { id: 'finish-buttercream', name: 'Buttercream' },
      ],
      decorations: [
        { id: 'deco-flowers', name: 'Fresh flowers', priceDelta: 35000 },
        { id: 'deco-edible-image', name: 'Edible image', priceDelta: 25000 },
        { id: 'deco-topper', name: 'Fondant topper', priceDelta: 45000 },
        { id: 'deco-drip', name: 'Drip effect', priceDelta: 20000 },
        { id: 'deco-gold-leaf', name: 'Gold leaf', priceDelta: 30000 },
      ],
      minimumLeadTimeHours: 48,
      basePrice: 285000,
    };
  }

  // â”€â”€ Cart and checkout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  createCart(
    input: {
      branchId?: string;
      customerId?: string;
      tableToken?: string;
    } = {},
  ) {
    const branchId = input.branchId ?? this.defaultBranchId;
    this.findBranch(branchId);
    const cart: CartRecord = {
      id: randomUUID(),
      branchId,
      customerId: input.customerId,
      tableToken: input.tableToken,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      items: [],
    };
    this.carts.set(cart.id, cart);
    return this.cartDto(cart);
  }

  getCart(id: string) {
    const cart = this.carts.get(id);
    if (!cart) throw new NotFoundException('Cart not found or expired.');
    if (new Date(cart.expiresAt).getTime() < Date.now()) {
      this.carts.delete(id);
      throw new NotFoundException('Cart not found or expired.');
    }
    return this.cartDto(cart);
  }

  private resolveCart(id: string) {
    const cart = this.carts.get(id);
    if (!cart) throw new NotFoundException('Cart not found or expired.');
    return cart;
  }

  addCartItem(
    cartId: string,
    input: { productId: string; quantity: number; note?: string },
  ) {
    const cart = this.resolveCart(cartId);
    const product = this.data.products.find(
      (item) => item.id === input.productId,
    );
    if (!product) throw new NotFoundException('Product not found.');
    if (!product.available)
      throw new ConflictException(`${product.name} is currently unavailable.`);
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new BadRequestException('Quantity must be between 1 and 99.');
    }
    cart.items.push({
      id: randomUUID(),
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity,
      lineTotal: product.price * quantity,
      note: input.note?.trim() || undefined,
      station: product.station,
    });
    return this.cartDto(cart);
  }

  updateCartItem(
    cartId: string,
    lineId: string,
    input: { quantity: number; note?: string },
  ) {
    const cart = this.resolveCart(cartId);
    const line = cart.items.find((item) => item.id === lineId);
    if (!line) throw new NotFoundException('Cart line not found.');
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new BadRequestException('Quantity must be between 1 and 99.');
    }
    line.quantity = quantity;
    line.lineTotal = line.unitPrice * quantity;
    line.note = input.note?.trim() || undefined;
    return this.cartDto(cart);
  }

  removeCartItem(cartId: string, lineId: string) {
    const cart = this.resolveCart(cartId);
    const index = cart.items.findIndex((item) => item.id === lineId);
    if (index === -1) throw new NotFoundException('Cart line not found.');
    cart.items.splice(index, 1);
    return this.cartDto(cart);
  }

  applyDiscount(
    cartId: string,
    input: { code?: string; percent?: number; managerPin?: string },
  ) {
    const cart = this.resolveCart(cartId);
    const subtotal = this.cartSubtotal(cart);
    let discount = 0;

    if (input.code?.trim()) {
      const record = this.discounts.find(
        (item) => item.code === input.code!.trim().toUpperCase() && item.active,
      );
      if (!record) throw new NotFoundException('That promo code is not valid.');
      discount =
        record.kind === 'PERCENT'
          ? Math.round((subtotal * record.value) / 100)
          : Math.min(record.value, subtotal);
    } else if (typeof input.percent === 'number') {
      if (input.percent <= 0 || input.percent > 100) {
        throw new BadRequestException(
          'Discount must be between 1 and 100 percent.',
        );
      }
      this.assertManagerPin(input.managerPin);
      discount = Math.round((subtotal * input.percent) / 100);
    } else {
      throw new BadRequestException('Provide a promo code or a percentage.');
    }

    return {
      cart: this.cartDto(cart),
      discount: money(discount),
      code: input.code?.trim().toUpperCase() ?? `MANUAL-${input.percent}%`,
    };
  }

  checkout(
    cartId: string,
    input: {
      fulfilmentMode: string;
      pickupAt?: string;
      tableLabel?: string;
      note?: string;
    },
    idempotencyKey: string,
  ): OrderDto {
    const cached = this.idempotency.get(`checkout:${idempotencyKey}`);
    if (cached) return cached as OrderDto;

    const cart = this.resolveCart(cartId);
    if (!cart.items.length) throw new BadRequestException('Cart has no items.');

    let pickupAt: string | undefined;
    if (input.pickupAt) {
      // Normalised to studio-local time so the capacity check and the calendar
      // agree on which day and slot an order belongs to.
      pickupAt = new Date(new Date(input.pickupAt).getTime() + 7 * 60 * 60_000)
        .toISOString()
        .slice(0, 16);
      const leadTimeHours = 48;
      const earliest = Date.now() + leadTimeHours * 60 * 60_000;
      const customCake = cart.items.some(
        (line) =>
          line.station === 'CAKE' || line.name.toLowerCase().includes('cake'),
      );
      if (customCake && new Date(input.pickupAt).getTime() < earliest) {
        throw new BadRequestException(
          `Custom cakes need at least ${leadTimeHours} hours of lead time.`,
        );
      }
      if (customCake) {
        const slot = pickupAt.slice(11, 16);
        if (!(CAKE_PICKUP_SLOTS as readonly string[]).includes(slot)) {
          throw new BadRequestException(
            `Pickup must be one of the studio's slots: ${CAKE_PICKUP_SLOTS.join(', ')}.`,
          );
        }
        this.assertCakeCapacity(pickupAt);
      }
    }

    const subtotal = this.cartSubtotal(cart);
    const order: DemoOrder = {
      id: randomUUID(),
      branchId: cart.branchId,
      customerId: cart.customerId,
      ticketNumber: this.nextTicketNumber(cart.branchId),
      fulfilmentMode: input.fulfilmentMode,
      tableLabel: input.tableLabel,
      status: 'PENDING_PAYMENT',
      subtotal,
      discount: 0,
      tax: 0,
      total: subtotal,
      pickupAt,
      note: input.note,
      items: cart.items.map((line) => ({
        id: line.id,
        productId: line.productId,
        name: line.name,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        note: line.note,
        modifiers: [],
        station: line.station as DemoOrder['items'][number]['station'],
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.customOrders.unshift(order);
    this.carts.delete(cartId);
    for (const line of order.items) {
      if (line.station === 'CAKE') continue;
      this.manualTasks.push({
        id: randomUUID(),
        stationId: line.station === 'BAR' ? STATIONS.bar : STATIONS.pastry,
        orderId: order.id,
        ticketNumber: order.ticketNumber,
        station: line.station,
        status: 'QUEUED',
        priority: 0,
        item: `${line.quantity}x ${line.name}`,
        allergenWarning: '',
        destination:
          order.fulfilmentMode === 'DINE_IN'
            ? (order.tableLabel ?? 'Counter')
            : 'Cashier 01',
        createdAt: order.createdAt,
      });
    }

    const result = this.orderDto(order);
    this.idempotency.set(`checkout:${idempotencyKey}`, result);
    this.realtime.emitBranch(order.branchId, 'order.created', result);
    for (const line of order.items) {
      if (line.station === 'CAKE') continue;
      this.realtime.emitStation(
        line.station === 'BAR' ? STATIONS.bar : STATIONS.pastry,
        'kds.ticket.created',
        { orderId: order.id, ticketNumber: order.ticketNumber },
      );
    }
    return result;
  }

  // â”€â”€ Orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  get orders() {
    return [...this.customOrders, ...this.data.orders];
  }

  listOrders(
    filters: {
      status?: string;
      branchId?: string;
      customerId?: string;
      search?: string;
      from?: string;
      to?: string;
      sort?: 'newest' | 'oldest' | 'total_desc';
    } = {},
    page: PageQuery = {},
  ): Paged<OrderDto> {
    const query = filters.search?.trim().toLocaleLowerCase('id-ID');
    const from = filters.from ? new Date(filters.from).getTime() : undefined;
    const to = filters.to ? new Date(filters.to).getTime() : undefined;

    const filtered = this.orders.filter((order) => {
      const matchesStatus = matchesOrderStatus(order.status, filters.status);
      const matchesBranch =
        !filters.branchId || order.branchId === filters.branchId;
      const matchesCustomer =
        !filters.customerId || order.customerId === filters.customerId;
      const matchesQuery =
        !query ||
        order.ticketNumber.includes(query) ||
        (order.customerName ?? '').toLocaleLowerCase('id-ID').includes(query) ||
        order.items.some((item) =>
          item.name.toLocaleLowerCase('id-ID').includes(query),
        );
      const created = new Date(order.createdAt).getTime();
      const matchesFrom = from === undefined || created >= from;
      const matchesTo = to === undefined || created <= to;
      return (
        matchesStatus &&
        matchesBranch &&
        matchesCustomer &&
        matchesQuery &&
        matchesFrom &&
        matchesTo
      );
    });

    const sorted = [...filtered];
    if (filters.sort === 'oldest') sorted.reverse();
    else if (filters.sort === 'total_desc')
      sorted.sort((left, right) => right.total - left.total);

    return this.paginate(
      sorted.map((order) => this.orderDto(order)),
      page,
    );
  }

  findOrder(id: string): DemoOrder {
    const order = this.orders.find((item) => item.id === id);
    if (!order) throw new NotFoundException('Order not found.');
    return order;
  }

  transitionOrder(orderId: string, status: string) {
    const order = this.findOrder(orderId);
    this.assertTransition(ORDER_TRANSITIONS, order.status, status, 'order');
    order.status = status;
    order.updatedAt = new Date().toISOString();
    if (status === 'READY' || status === 'FULFILLED') {
      this.ensureReceipt(order);
    }
    const result = this.orderDto(order);
    this.realtime.emitOrder(order.id, 'order.updated', result);
    this.realtime.emitBranch(order.branchId, 'order.updated', result);
    return result;
  }

  settlePayment(
    orderId: string,
    input: { method: string; amount?: number },
    idempotencyKey: string,
  ): PaymentResult {
    const key = `payment:${idempotencyKey}`;
    const cached = this.idempotency.get(key);
    if (cached) return cached as PaymentResult;

    const order = this.findOrder(orderId);
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException('Only pending orders can be paid.');
    }
    if (input.amount !== undefined && input.amount !== order.total) {
      throw new BadRequestException(
        'Payment amount must equal the server total.',
      );
    }
    order.status = 'PAID';
    order.paymentMethod = input.method;
    order.updatedAt = new Date().toISOString();

    const payment = {
      id: randomUUID(),
      orderId,
      provider: 'sandbox',
      providerRef: `sbx_${Date.now()}`,
      method: input.method,
      amount: money(order.total),
      status: 'SETTLED',
      settledAt: new Date().toISOString(),
    };
    this.idempotency.set(key, payment);
    this.realtime.emitOrder(orderId, 'payment.settled', payment);
    this.realtime.emitBranch(
      order.branchId,
      'order.updated',
      this.orderDto(order),
    );
    return payment;
  }

  refund(
    orderId: string,
    input: { amount: number; reason: string; managerPin: string },
    idempotencyKey: string,
  ): RefundResult {
    this.assertManagerPin(input.managerPin);
    const key = `refund:${idempotencyKey}`;
    const cached = this.idempotency.get(key);
    if (cached) return cached as RefundResult;

    const order = this.findOrder(orderId);
    // Once a payment is captured the order can be refunded at any point in the
    // fulfilment flow, not only before it is accepted.
    if (UNPAID_ORDER_STATUSES.has(order.status)) {
      throw new ConflictException(
        'Order is not refundable until its payment is settled.',
      );
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero.');
    }
    if (input.amount > order.total) {
      throw new BadRequestException('Refund exceeds the paid amount.');
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException('A refund reason is required.');
    }

    order.status =
      input.amount === order.total ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    order.refunded = (order.refunded ?? 0) + input.amount;
    order.updatedAt = new Date().toISOString();

    const result = {
      id: randomUUID(),
      orderId,
      ticketNumber: order.ticketNumber,
      amount: money(input.amount),
      reason: input.reason.trim(),
      status: 'SETTLED',
      createdAt: new Date().toISOString(),
    };
    this.idempotency.set(key, result);
    this.realtime.emitOrder(orderId, 'order.refunded', result);
    this.realtime.emitBranch(
      order.branchId,
      'order.updated',
      this.orderDto(order),
    );
    return result;
  }

  private ensureReceipt(order: DemoOrder) {
    const existing = [...this.receipts.values()].find(
      (receipt) => receipt.orderId === order.id,
    );
    if (existing) return this.receiptDto(existing);
    const receipt: ReceiptRecord = {
      id: randomUUID(),
      orderId: order.id,
      receiptNo: `RCP-${order.ticketNumber}`,
      printedAt: new Date().toISOString(),
      channel: 'THERMAL',
    };
    this.receipts.set(receipt.id, receipt);
    return this.receiptDto(receipt);
  }

  getReceipt(orderId: string) {
    const order = this.findOrder(orderId);
    return this.ensureReceipt(order);
  }

  listReceipts(page: PageQuery = {}) {
    const all = [...this.receipts.values()]
      .sort((left, right) => right.printedAt.localeCompare(left.printedAt))
      .map((receipt) => {
        const order = this.orders.find((item) => item.id === receipt.orderId);
        return {
          ...this.receiptDto(receipt),
          branchName: order
            ? (this.data.branches.find((item) => item.id === order.branchId)
                ?.name ?? '')
            : '',
          total: order ? money(order.total) : money(0),
        };
      });
    return this.paginate(all, page);
  }

  // â”€â”€ Kitchen display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  get stations() {
    return [
      {
        id: STATIONS.bar,
        branchId: this.defaultBranchId,
        name: 'Main Bar',
        type: 'BAR',
        active: true,
        openTasks: this.listTasks('BAR').items.filter(
          (task) => task.status !== 'DONE',
        ).length,
      },
      {
        id: STATIONS.pastry,
        branchId: this.defaultBranchId,
        name: 'Pastry Pass',
        type: 'PASTRY',
        active: true,
        openTasks: this.listTasks('PASTRY').items.filter(
          (task) => task.status !== 'DONE',
        ).length,
      },
      {
        id: STATIONS.cake,
        branchId: this.defaultBranchId,
        name: 'Cake Studio',
        type: 'CAKE',
        active: true,
        openTasks: this.cakeJobs.filter(
          (job) => job.stage !== 'PICKED_UP' && job.stage !== 'CANCELLED',
        ).length,
      },
    ];
  }

  listTasks(station?: string, page: PageQuery = {}) {
    const all = [...this.manualTasks, ...this.data.kitchenTasks].filter(
      (task) => !station || task.station === station,
    );
    all.sort((left, right) => {
      const byPriority = (right.priority ?? 0) - (left.priority ?? 0);
      if (byPriority !== 0) return byPriority;
      return left.createdAt.localeCompare(right.createdAt);
    });
    return this.paginate(
      all.map((task) => ({
        ...task,
        elapsedSeconds: Math.max(
          0,
          Math.round((Date.now() - new Date(task.createdAt).getTime()) / 1000),
        ),
      })),
      page,
    );
  }

  transitionTask(taskId: string, status: string) {
    const task = [...this.manualTasks, ...this.data.kitchenTasks].find(
      (item) => item.id === taskId,
    );
    if (!task) throw new NotFoundException('Kitchen task not found.');
    this.assertTransition(
      TASK_TRANSITIONS,
      task.status,
      status,
      'kitchen task',
    );
    task.status = status;
    if (status === 'IN_PROGRESS' && !task.startedAt) {
      task.startedAt = new Date().toISOString();
    }
    if (status === 'DONE') task.completedAt = new Date().toISOString();
    this.realtime.emitStation(task.stationId, 'kds.ticket.changed', task);
    return task;
  }

  // â”€â”€ Cake production â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  get cakeJobs() {
    return [...this.customCakeJobs, ...this.data.cakeJobs];
  }

  listCakeJobs(
    filters: { stage?: string; search?: string } = {},
    page: PageQuery = {},
  ) {
    const query = filters.search?.trim().toLocaleLowerCase('id-ID');
    const filtered = this.cakeJobs
      .filter((job) => {
        const matchesStage = !filters.stage || job.stage === filters.stage;
        const matchesQuery =
          !query ||
          job.title.toLocaleLowerCase('id-ID').includes(query) ||
          job.customer.toLocaleLowerCase('id-ID').includes(query);
        return matchesStage && matchesQuery;
      })
      .sort((left, right) => left.pickupAt.localeCompare(right.pickupAt));
    return this.paginate(filtered, page);
  }

  findCakeJob(id: string) {
    const job = this.cakeJobs.find((item) => item.id === id);
    if (!job) throw new NotFoundException('Cake job not found.');
    return job;
  }

  transitionCake(jobId: string, stage: string) {
    const job = this.findCakeJob(jobId);
    this.assertTransition(CAKE_TRANSITIONS, job.stage, stage, 'cake job');
    job.stage = stage;
    this.realtime.emitBranch(this.defaultBranchId, 'cake.stage.changed', job);
    return job;
  }

  createCakeJob(input: {
    title: string;
    customer: string;
    occasion: string;
    tier: string;
    flavour: string;
    servings: string;
    pickupAt: string;
    pipingMessage?: string;
    allergens?: string[];
    notes?: string;
  }) {
    const requested = new Date(input.pickupAt);
    if (Number.isNaN(requested.getTime())) {
      throw new BadRequestException('Pickup time is not a valid date.');
    }
    if (requested.getTime() < Date.now() + 48 * 60 * 60_000) {
      throw new BadRequestException(
        'Custom cakes need at least 48 hours of lead time.',
      );
    }
    // Store and compare the pickup in the studio's own timezone. Jakarta is UTC+7
    // all year, so the offset is fixed rather than seasonal. Normalising here is
    // what lets `capacity()` and the booking rule agree on the same day and slot.
    const local = new Date(requested.getTime() + 7 * 60 * 60_000);
    const slot = local.toISOString().slice(11, 16);
    if (!(CAKE_PICKUP_SLOTS as readonly string[]).includes(slot)) {
      throw new BadRequestException(
        `Pickup must be one of the studio's slots: ${CAKE_PICKUP_SLOTS.join(', ')}.`,
      );
    }
    const pickupAt = local.toISOString().slice(0, 16);
    this.assertCakeCapacity(pickupAt);

    const job: DemoCakeJob = {
      id: randomUUID(),
      orderId: randomUUID(),
      branchId: this.defaultBranchId,
      customer: input.customer,
      title: input.title.trim(),
      occasion: input.occasion,
      stage: 'REVIEW',
      tier: input.tier,
      flavour: input.flavour,
      servings: input.servings,
      pickupAt,
      pipingMessage: input.pipingMessage?.trim() || 'No message',
      allergens: input.allergens ?? [],
      assignedChef: 'Unassigned',
      depositPaid: 0,
      referenceUrls: [],
      notes: input.notes?.trim() || '',
    };
    this.customCakeJobs.unshift(job);
    this.realtime.emitBranch(this.defaultBranchId, 'cake.created', job);
    return job;
  }

  capacity(date?: string) {
    const target = date ?? new Date().toISOString().slice(0, 10);
    const sameDay = this.cakeJobs.filter(
      (job) =>
        job.pickupAt.slice(0, 10) === target && job.stage !== 'CANCELLED',
    );
    const slots = CAKE_PICKUP_SLOTS.map((time) => {
      const used = sameDay.filter(
        (job) => job.pickupAt.slice(11, 16) === time,
      ).length;
      return {
        time,
        used,
        limit: CAKE_SLOT_CAPACITY,
        available: Math.max(0, CAKE_SLOT_CAPACITY - used),
      };
    });
    const used = sameDay.length;
    return {
      date: target,
      branchId: this.defaultBranchId,
      used,
      limit: CAKE_CAPACITY_PER_DAY,
      available: Math.max(0, CAKE_CAPACITY_PER_DAY - used),
      utilisationPercent: Math.min(
        100,
        Math.round((used / CAKE_CAPACITY_PER_DAY) * 100),
      ),
      slots,
    };
  }

  calendar(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(Date.now() - 7 * 86400_000);
    const end = to ? new Date(to) : new Date(Date.now() + 21 * 86400_000);
    const events = this.cakeJobs
      .filter((job) => {
        const pickup = new Date(job.pickupAt).getTime();
        return pickup >= start.getTime() && pickup <= end.getTime();
      })
      .sort((left, right) => left.pickupAt.localeCompare(right.pickupAt));
    return {
      timezone: 'Asia/Jakarta',
      range: { from: start.toISOString(), to: end.toISOString() },
      events: events.map((job) => ({
        id: job.id,
        title: job.title,
        customer: job.customer,
        start: job.pickupAt,
        stage: job.stage,
        tier: job.tier,
        assignedChef: job.assignedChef,
      })),
    };
  }

  prepSheet(date?: string) {
    const target = date ?? new Date().toISOString().slice(0, 10);
    const jobs = this.cakeJobs.filter(
      (job) => job.pickupAt.slice(0, 10) === target,
    );
    const recipes = this.data.recipes;
    const lines = new Map<
      string,
      { ingredient: string; quantity: number; unit: string }
    >();
    for (const job of jobs) {
      const recipe =
        recipes.find((item) =>
          job.flavour
            .toLocaleLowerCase('id-ID')
            .includes(item.name.split(' ')[0].toLocaleLowerCase('id-ID')),
        ) ?? recipes[0];
      for (const line of recipe.lines) {
        const existing = lines.get(line.ingredient);
        lines.set(line.ingredient, {
          ingredient: line.ingredient,
          quantity: (existing?.quantity ?? 0) + line.quantity,
          unit: line.unit,
        });
      }
    }
    return {
      date: target,
      timezone: 'Asia/Jakarta',
      jobs: jobs.map((job) => ({
        id: job.id,
        title: job.title,
        stage: job.stage,
        pickupAt: job.pickupAt,
        tier: job.tier,
        flavour: job.flavour,
        servings: job.servings,
        pipingMessage: job.pipingMessage,
        allergens: job.allergens,
      })),
      ingredientTotals: [...lines.values()].sort((left, right) =>
        left.ingredient.localeCompare(right.ingredient),
      ),
      printReady: jobs.length > 0,
    };
  }

  // â”€â”€ Inventory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  listIngredients(
    filters: { search?: string; status?: string } = {},
    page: PageQuery = {},
  ) {
    const query = filters.search?.trim().toLocaleLowerCase('id-ID');
    const filtered = this.data.ingredients.filter((item) => {
      const matchesQuery =
        !query ||
        item.name.toLocaleLowerCase('id-ID').includes(query) ||
        item.sku.toLocaleLowerCase('id-ID').includes(query) ||
        item.supplier.toLocaleLowerCase('id-ID').includes(query);
      const matchesStatus = !filters.status || item.status === filters.status;
      return matchesQuery && matchesStatus;
    });
    return this.paginate(filtered, page);
  }

  adjustStock(
    ingredientId: string,
    input: { quantity: number; reason: string; managerPin: string },
  ) {
    this.assertManagerPin(input.managerPin);
    const item = this.data.ingredients.find(
      (record) => record.id === ingredientId,
    );
    if (!item) throw new NotFoundException('Ingredient not found.');
    if (!input.reason?.trim())
      throw new BadRequestException('An adjustment reason is required.');
    if (!Number.isFinite(input.quantity) || input.quantity === 0) {
      throw new BadRequestException('Adjustment quantity cannot be zero.');
    }
    const next = item.quantity + input.quantity;
    if (next < 0)
      throw new BadRequestException('Stock cannot fall below zero.');
    item.quantity = Math.round(next * 1000) / 1000;
    item.status = item.quantity <= item.reorderLevel ? 'LOW_STOCK' : 'HEALTHY';
    item.updatedAt = new Date().toISOString();
    this.realtime.emitBranch(this.defaultBranchId, 'inventory.changed', item);
    if (item.status === 'LOW_STOCK') {
      this.realtime.emitBranch(this.defaultBranchId, 'inventory.alert', {
        ingredient: item.name,
        quantity: item.quantity,
      });
    }
    return item;
  }

  stockAlerts() {
    return this.data.ingredients
      .filter((item) => item.status === 'LOW_STOCK')
      .map((item) => ({
        id: `alert-${item.id}`,
        branchId: this.defaultBranchId,
        branchName: 'KEDAI SCBD',
        ingredientId: item.id,
        ingredient: item.name,
        severity:
          item.quantity <= item.reorderLevel / 2 ? 'CRITICAL' : 'WARNING',
        message: `${item.name} is below its reorder level (${item.quantity} ${item.unit} left, reorder at ${item.reorderLevel} ${item.unit}).`,
        supplier: item.supplier,
        resolvedAt: null as string | null,
      }));
  }

  listDisplayCase(page: PageQuery = {}) {
    return this.paginate(
      this.data.displayCase.map((entry) => {
        const product = this.data.products.find(
          (item) => item.id === entry.productId,
        );
        return {
          ...entry,
          sku: product?.sku ?? '',
          allergens: product?.allergens ?? [],
          status: entry.quantity === 0 ? 'EMPTY' : 'AVAILABLE',
          lowThreshold: Math.max(1, Math.ceil(entry.capacity * 0.15)),
        };
      }),
      page,
    );
  }

  recountDisplayCase(productId: string, quantity: number) {
    const entry = this.data.displayCase.find(
      (item) => item.productId === productId,
    );
    if (!entry) throw new NotFoundException('Display case item not found.');
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new BadRequestException(
        'Recount value must be a positive whole number.',
      );
    }
    if (quantity > entry.capacity) {
      throw new BadRequestException(
        `The case holds at most ${entry.capacity} units.`,
      );
    }
    entry.quantity = quantity;
    entry.updatedAt = new Date().toISOString();
    this.realtime.emitBranch(
      this.defaultBranchId,
      'display-case.changed',
      entry,
    );
    return entry;
  }

  get recipes() {
    return this.data.recipes;
  }

  // â”€â”€ Customers, loyalty, subscriptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  listCustomers(
    filters: { search?: string; tier?: string } = {},
    page: PageQuery = {},
  ) {
    const query = filters.search?.trim().toLocaleLowerCase('id-ID');
    const filtered = this.data.customers.filter((customer) => {
      const matchesQuery =
        !query ||
        customer.name.toLocaleLowerCase('id-ID').includes(query) ||
        customer.phone.includes(query) ||
        customer.email.toLocaleLowerCase('id-ID').includes(query);
      const matchesTier = !filters.tier || customer.tier === filters.tier;
      return matchesQuery && matchesTier;
    });
    return this.paginate(filtered, page);
  }

  findCustomer(id: string): DemoCustomer {
    const customer = this.data.customers.find((item) => item.id === id);
    if (!customer) throw new NotFoundException('Customer not found.');
    return customer;
  }

  customerDetail(id: string) {
    const customer = this.findCustomer(id);
    const orders = this.orders.filter((order) => order.customerId === id);
    return {
      customer: {
        ...customer,
        lifetimeValue: money(customer.totalSpend),
        averageBasket: money(
          Math.round(customer.totalSpend / Math.max(1, customer.orderCount)),
        ),
      },
      orders: orders.slice(0, 10).map((order) => this.orderDto(order)),
      occasions: this.data.occasions.filter(
        (occasion) => occasion.customerId === id,
      ),
      subscriptions: this.data.subscriptions.filter(
        (subscription) => subscription.customerId === id,
      ),
      loyaltyLedger: this.loyaltyLedger(id),
      segments: this.customerSegments(id),
    };
  }

  private customerSegments(id: string) {
    const customer = this.findCustomer(id);
    const segments: Array<{ label: string; reason: string }> = [];
    if (customer.orderCount >= 25)
      segments.push({ label: 'Frequent', reason: '25 or more orders' });
    if (customer.totalSpend >= 1_500_000)
      segments.push({ label: 'High value', reason: 'Spend above Rp1.500.000' });
    if (customer.whatsappOptIn)
      segments.push({
        label: 'WhatsApp reachable',
        reason: 'Marketing consent given',
      });
    const days = Math.round(
      (Date.now() - new Date(customer.lastVisitAt).getTime()) / 86400_000,
    );
    if (days > 30)
      segments.push({ label: 'At risk', reason: `No visit for ${days} days` });
    return segments.length
      ? segments
      : [{ label: 'New', reason: 'Fewer than 5 orders' }];
  }

  loyaltyAccount(customerId: string) {
    const customer = this.data.customers.find((item) => item.id === customerId);
    const points = customer?.points ?? 0;
    return {
      customerId,
      customerName: customer?.name ?? 'KEDAI Guest',
      tier: customer?.tier ?? 'Brew',
      points,
      nextTier:
        points < 500 ? 'Daily Brew' : points < 1500 ? 'Gold Brew' : 'Reserve',
      pointsToNextTier:
        points < 500 ? 500 - points : points < 1500 ? 1500 - points : 0,
      rewards: [
        {
          id: 'reward-coffee',
          name: 'Complimentary hand-drip coffee',
          points: 500,
          available: points >= 500,
        },
        {
          id: 'reward-cake-slice',
          name: 'Cake slice of the day',
          points: 750,
          available: points >= 750,
        },
        {
          id: 'reward-cake-10',
          name: '10% off a whole cake',
          points: 1200,
          available: points >= 1200,
        },
      ],
      birthdayBenefit: {
        active: true,
        description: 'A free cake slice in the month of your birthday.',
      },
    };
  }

  loyaltyLedger(customerId: string) {
    const customer = this.data.customers.find((item) => item.id === customerId);
    const base = customer?.points ?? 100;
    return [
      {
        id: `ledger-${customerId}-3`,
        points: 145,
        reason: 'Order #8804 Â· Gold Brew multiplier',
        createdAt: new Date(Date.now() - 6 * 86400_000).toISOString(),
      },
      {
        id: `ledger-${customerId}-2`,
        points: 92,
        reason: 'Order #8790 Â· points earned',
        createdAt: new Date(Date.now() - 12 * 86400_000).toISOString(),
      },
      {
        id: `ledger-${customerId}-1`,
        points: -750,
        reason: 'Redeemed cake slice reward',
        createdAt: new Date(Date.now() - 19 * 86400_000).toISOString(),
      },
      {
        id: `ledger-${customerId}-0`,
        points: 100,
        reason: 'Welcome to KEDAI',
        createdAt: new Date(Date.now() - 40 * 86400_000).toISOString(),
      },
    ].map((entry) => ({
      ...entry,
      balanceAfter: Math.max(0, base - 400 + entry.points),
    }));
  }

  get occasions() {
    return this.data.occasions;
  }

  listOccasions(page: PageQuery = {}) {
    const sorted = [...this.data.occasions].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
    return this.paginate(sorted, page);
  }

  toggleOccasionReminders(id: string, reminders: boolean) {
    const occasion = this.data.occasions.find((item) => item.id === id);
    if (!occasion) throw new NotFoundException('Occasion not found.');
    occasion.reminders = reminders;
    return occasion;
  }

  get subscriptionPlans() {
    return SUBSCRIPTION_PLANS.map((plan) => ({
      ...plan,
      price: money(plan.price),
      active: true,
    }));
  }

  listSubscriptions(page: PageQuery = {}) {
    return this.paginate(this.data.subscriptions, page);
  }

  changeSubscriptionStatus(
    id: string,
    status: 'ACTIVE' | 'PAUSED' | 'CANCELLED',
  ) {
    const subscription = this.data.subscriptions.find((item) => item.id === id);
    if (!subscription) throw new NotFoundException('Subscription not found.');
    subscription.status = status;
    return subscription;
  }

  subscribe(customerId: string, planId: string) {
    const plan = SUBSCRIPTION_PLANS.find((item) => item.id === planId);
    if (!plan) throw new NotFoundException('Subscription plan not found.');
    const customer = this.data.customers.find((item) => item.id === customerId);
    const existing = this.data.subscriptions.find(
      (item) => item.customerId === customerId && item.status === 'ACTIVE',
    );
    if (existing) {
      throw new ConflictException(
        'This customer already has an active subscription.',
      );
    }
    const created = {
      id: randomUUID(),
      customerId,
      customerName: customer?.name ?? 'KEDAI Guest',
      planId: plan.id,
      plan: plan.name,
      status: 'ACTIVE',
      price: plan.price,
      usedUnits: 0,
      includedUnits: plan.includedUnits,
      rolloverUnits: plan.rolloverUnits,
      renewsAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    };
    this.data.subscriptions.unshift(created);
    return created;
  }

  // â”€â”€ Reporting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  dashboard(filters: { branchId?: string; days?: number } = {}) {
    const days = Math.min(90, Math.max(7, filters.days ?? 30));
    const scoped = this.orders.filter(
      (order) => !filters.branchId || order.branchId === filters.branchId,
    );
    const since = Date.now() - days * 86400_000;
    const previousSince = since - days * 86400_000;

    const current = scoped.filter(
      (order) => new Date(order.createdAt).getTime() >= since,
    );
    const previous = scoped.filter((order) => {
      const created = new Date(order.createdAt).getTime();
      return created >= previousSince && created < since;
    });

    const revenue = current
      .filter((order) => order.status !== 'CANCELLED')
      .reduce((sum, order) => sum + order.total, 0);
    const previousRevenue = previous
      .filter((order) => order.status !== 'CANCELLED')
      .reduce((sum, order) => sum + order.total, 0);
    const paidOrders = current.filter((order) =>
      ['PAID', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'FULFILLED'].includes(
        order.status,
      ),
    );
    const cakeJobs = this.cakeJobs.filter(
      (job) => job.stage !== 'CANCELLED' && job.stage !== 'PICKED_UP',
    );
    const lowStock = this.data.ingredients.filter(
      (item) => item.status === 'LOW_STOCK',
    );

    return {
      timezone: 'Asia/Jakarta',
      generatedAt: new Date().toISOString(),
      range: {
        days,
        from: new Date(since).toISOString(),
        to: new Date().toISOString(),
      },
      metrics: [
        {
          key: 'revenue',
          label: 'Revenue',
          value: money(revenue),
          previous: money(previousRevenue),
          changePercent: this.changePercent(revenue, previousRevenue),
        },
        {
          key: 'orders',
          label: 'Orders',
          value: String(current.length),
          previous: String(previous.length),
          changePercent: this.changePercent(current.length, previous.length),
        },
        {
          key: 'averageBasket',
          label: 'Average basket',
          value: money(Math.round(revenue / Math.max(1, paidOrders.length))),
          previous: money(
            Math.round(previousRevenue / Math.max(1, previous.length)),
          ),
          changePercent: this.changePercent(
            revenue / Math.max(1, paidOrders.length),
            previousRevenue / Math.max(1, previous.length),
          ),
        },
        {
          key: 'cakeCapacity',
          label: 'Cake capacity in use',
          value: String(this.capacity().used),
          unit: `of ${CAKE_CAPACITY_PER_DAY} slots`,
          previous: String(Math.max(0, cakeJobs.length - 1)),
          changePercent: this.changePercent(
            cakeJobs.length,
            cakeJobs.length - 1,
          ),
        },
      ],
      revenueSeries: this.revenueSeries(scoped, days),
      ordersByStatus: this.countByStatus(current),
      topProducts: this.topProducts(scoped, 6),
      branchPerformance: this.branchPerformance(scoped),
      hourlyHeatmap: this.hourlyHeatmap(scoped),
      alerts: lowStock.map((item) => ({
        id: `alert-${item.id}`,
        severity:
          item.quantity <= item.reorderLevel / 2 ? 'CRITICAL' : 'WARNING',
        message: `${item.name} is low at KEDAI SCBD (${item.quantity} ${item.unit} left).`,
        href: '/admin/inventory',
      })),
    };
  }

  salesReport(filters: { from?: string; to?: string; branchId?: string } = {}) {
    const from = filters.from
      ? new Date(filters.from).getTime()
      : Date.now() - 7 * 86400_000;
    const to = filters.to ? new Date(filters.to).getTime() : Date.now();
    const scoped = this.orders.filter((order) => {
      const created = new Date(order.createdAt).getTime();
      return (
        created >= from &&
        created <= to &&
        (!filters.branchId || order.branchId === filters.branchId)
      );
    });
    const billable = scoped.filter((order) => order.status !== 'CANCELLED');
    return {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      grossRevenue: money(
        billable.reduce((sum, order) => sum + order.subtotal, 0),
      ),
      discounts: money(scoped.reduce((sum, order) => sum + order.discount, 0)),
      refunds: money(
        scoped.reduce((sum, order) => sum + (order.refunded ?? 0), 0),
      ),
      orderCount: scoped.length,
      averageBasket: money(
        Math.round(
          billable.reduce((sum, order) => sum + order.total, 0) /
            Math.max(1, billable.length),
        ),
      ),
      topProducts: this.topProducts(scoped, 8),
      statusBreakdown: this.countByStatus(scoped),
      hourlyHeatmap: this.hourlyHeatmap(scoped),
    };
  }

  topProductsReport(limit: number) {
    return this.topProducts(this.orders, limit);
  }

  topProducts(orders: DemoOrder[], limit: number) {
    const totals = new Map<
      string,
      { name: string; quantity: number; revenue: number }
    >();
    for (const order of orders) {
      if (order.status === 'CANCELLED') continue;
      for (const item of order.items) {
        const entry = totals.get(item.productId) ?? {
          name: item.name,
          quantity: 0,
          revenue: 0,
        };
        entry.quantity += item.quantity;
        entry.revenue += item.lineTotal;
        totals.set(item.productId, entry);
      }
    }
    return [...totals.values()]
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, limit)
      .map((entry) => ({
        name: entry.name,
        quantity: entry.quantity,
        revenue: money(entry.revenue),
      }));
  }

  cakeProductionReport() {
    const jobs = this.cakeJobs;
    const byStage = this.groupCount(jobs, (job) => job.stage);
    return {
      total: jobs.length,
      byStage,
      onTimeRatePercent: 86,
      averageLeadTimeHours: 62,
      allergensPresent: [
        ...new Set(jobs.flatMap((job) => job.allergens)),
      ].sort(),
      depositsHeld: money(jobs.reduce((sum, job) => sum + job.depositPaid, 0)),
      upcoming: jobs
        .filter((job) => new Date(job.pickupAt).getTime() > Date.now())
        .sort((left, right) => left.pickupAt.localeCompare(right.pickupAt))
        .slice(0, 5)
        .map((job) => ({
          id: job.id,
          title: job.title,
          stage: job.stage,
          pickupAt: job.pickupAt,
          assignedChef: job.assignedChef,
        })),
    };
  }

  forecast(days = 7) {
    const horizon = Math.min(30, Math.max(1, days));
    const capacity = this.capacity();
    const averagePerDay = Math.max(
      1,
      this.orders.filter((order) =>
        order.items.some((item) => item.name.toLowerCase().includes('cake')),
      ).length / 30,
    );
    return {
      horizonDays: horizon,
      timezone: 'Asia/Jakarta',
      expectedCustomCakesPerDay: Math.round(averagePerDay * 10) / 10,
      currentUtilisationPercent: capacity.utilisationPercent,
      staffingRecommendation:
        capacity.utilisationPercent > 80
          ? 'Add a second cake chef for the weekend shift.'
          : 'Current chef coverage is sufficient.',
      slots: Array.from({ length: horizon }, (_, index) => {
        const date = new Date(Date.now() + (index + 1) * 86400_000)
          .toISOString()
          .slice(0, 10);
        const projected = Math.min(
          CAKE_CAPACITY_PER_DAY,
          Math.round(averagePerDay * (index % 3 === 1 ? 2.4 : 1)),
        );
        return {
          date,
          projected,
          capacity: CAKE_CAPACITY_PER_DAY,
          utilisationPercent: Math.round(
            (projected / CAKE_CAPACITY_PER_DAY) * 100,
          ),
          risk: projected >= CAKE_CAPACITY_PER_DAY ? 'AT_CAPACITY' : 'ON_TRACK',
        };
      }),
    };
  }

  staffing() {
    const jobs = this.cakeJobs.filter(
      (job) => job.stage !== 'PICKED_UP' && job.stage !== 'CANCELLED',
    );
    const byChef = new Map<string, number>();
    for (const job of jobs) {
      byChef.set(job.assignedChef, (byChef.get(job.assignedChef) ?? 0) + 1);
    }
    return {
      capacityPerChef: 3,
      chefs: [...byChef.entries()].map(([chef, assigned]) => ({
        chef,
        assignedJobs: assigned,
        utilisationPercent: Math.round((assigned / 3) * 100),
        status:
          assigned >= 3 ? 'FULL' : assigned === 0 ? 'AVAILABLE' : 'BALANCED',
      })),
      unassigned: jobs.filter((job) => job.assignedChef === 'Unassigned')
        .length,
      totalOpenJobs: jobs.length,
    };
  }

  // â”€â”€ Platform â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  listActivity(page: PageQuery = {}) {
    return this.paginate(
      [...this.data.activity].sort((left, right) =>
        right.occurredAt.localeCompare(left.occurredAt),
      ),
      page,
    );
  }

  get notificationTemplates() {
    return this.data.notificationTemplates;
  }

  get notificationDeliveries() {
    return [...this.data.notificationDeliveries].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  get webhooks() {
    return this.data.webhooks;
  }

  findWebhook(id: string) {
    const webhook = this.data.webhooks.find((item) => item.id === id);
    if (!webhook) throw new NotFoundException('Webhook endpoint not found.');
    return webhook;
  }

  createWebhook(input: {
    name: string;
    url: string;
    secret: string;
    events: string[];
  }) {
    const created = {
      id: randomUUID(),
      name: input.name.trim(),
      url: input.url.trim(),
      secret: input.secret,
      events: input.events.length ? input.events : ['order.settled'],
      active: true,
      lastDeliveryStatus: 'QUEUED',
      lastDeliveryAt: undefined as string | undefined,
    };
    this.data.webhooks.unshift(created);
    return created;
  }

  deleteWebhook(id: string) {
    const index = this.data.webhooks.findIndex((item) => item.id === id);
    if (index === -1)
      throw new NotFoundException('Webhook endpoint not found.');
    this.data.webhooks.splice(index, 1);
    return { id, deleted: true };
  }

  toggleWebhook(id: string, active: boolean) {
    const webhook = this.findWebhook(id);
    webhook.active = active;
    return webhook;
  }

  /**
   * Deep-merges a validated patch into the current settings.
   *
   * `class-transformer` materialises every declared DTO property, so an absent
   * key arrives as `undefined`. Those keys are stripped before merging, which
   * keeps a partial update from erasing untouched settings.
   */
  saveSettings(patch: Record<string, unknown>) {
    for (const [section, value] of Object.entries(patch ?? {})) {
      if (value === undefined) continue;
      if (!(section in this.data.settings)) {
        throw new BadRequestException(`Unknown settings section "${section}".`);
      }
      this.data.settings[section] = this.mergeDeep(
        this.data.settings[section],
        value,
      );
    }
    return this.data.settings;
  }

  private mergeDeep(current: unknown, patch: unknown): unknown {
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      patch &&
      typeof patch === 'object' &&
      !Array.isArray(patch)
    ) {
      const base = { ...(current as Record<string, unknown>) };
      for (const [key, value] of Object.entries(
        patch as Record<string, unknown>,
      )) {
        if (value === undefined) continue;
        base[key] = this.mergeDeep(base[key], value);
      }
      return base;
    }
    return patch;
  }

  findTableSession(token: string): DemoTableSession {
    const session = this.data.tableSessions.find(
      (item) => item.token === token,
    );
    if (!session)
      throw new NotFoundException('This table link is no longer active.');
    return session;
  }

  listTableSessions(page: PageQuery = {}) {
    return this.paginate(this.data.tableSessions, page);
  }

  requestTableBill(token: string) {
    const session = this.findTableSession(token);
    session.status = 'BILL_REQUESTED';
    this.realtime.emitBranch(session.branchId, 'table.bill-requested', session);
    return session;
  }

  createCustomPosItem(input: { name: string; note?: string; price?: number }) {
    if (typeof input.price === 'number' && input.price <= 0) {
      throw new BadRequestException('Price must be greater than zero.');
    }
    return {
      id: randomUUID(),
      name: input.name.trim(),
      note: input.note?.trim() || undefined,
      price: input.price ?? 0,
      status: 'DRAFT',
      requiresManagerApproval: true,
      createdAt: new Date().toISOString(),
    };
  }

  verifyPickup(orderId: string) {
    const order = this.findOrder(orderId);
    const isReady = order.status === 'READY';
    if (isReady) order.status = 'FULFILLED';
    return {
      orderId,
      ticketNumber: order.ticketNumber,
      verification: isReady ? 'MATCHED' : 'NOT_READY',
      orderStatus: order.status,
      customerName: order.customerName ?? 'Walk-in customer',
      verifiedAt: new Date().toISOString(),
    };
  }

  supportDetails() {
    const branch = this.data.branches[0];
    return {
      email: 'support@kedai.example',
      whatsapp: branch.phone,
      hours: `${branch.hours} ${branch.timezone}`,
      channels: ['Email', 'WhatsApp', 'In-store at the counter'],
      responseTimeHours: 4,
    };
  }

  privacyControls() {
    return {
      export: { endpoint: '/api/v1/customers/me/data-export', windowHours: 24 },
      deletion: {
        endpoint: '/api/v1/customers/me/delete-request',
        windowDays: 7,
      },
      consents: ['marketing', 'whatsapp', 'occasion-reminders'],
      retentionDays: 1095,
    };
  }

  serviceStatus() {
    return {
      generatedAt: new Date().toISOString(),
      services: [
        {
          id: 'storefront',
          name: 'Storefront and catalog',
          status: 'OPERATIONAL',
          latencyMs: 42,
        },
        {
          id: 'payments',
          name: 'Payment gateway (sandbox)',
          status: 'OPERATIONAL',
          latencyMs: 118,
        },
        {
          id: 'kds',
          name: 'Kitchen realtime',
          status: 'OPERATIONAL',
          latencyMs: 31,
        },
        {
          id: 'notifications',
          name: 'WhatsApp and email (sandbox)',
          status: 'DEGRADED',
          latencyMs: 640,
        },
        {
          id: 'webhooks',
          name: 'Merchant webhooks',
          status: 'DEGRADED',
          latencyMs: 512,
        },
      ],
      incidents: [
        {
          id: 'incident-1',
          severity: 'WARNING',
          summary: 'Two webhook deliveries retried after a 500 response.',
          openedAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
        },
      ],
    };
  }

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private paginate<T>(items: T[], page: PageQuery): Paged<T> {
    const pageSize = Math.min(200, Math.max(1, page.pageSize ?? 25));
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const current = Math.min(totalPages, Math.max(1, page.page ?? 1));
    const start = (current - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      page: current,
      pageSize,
      total: items.length,
      totalPages,
    };
  }

  private cartSubtotal(cart: CartRecord) {
    return cart.items.reduce((sum, item) => sum + item.lineTotal, 0);
  }

  private cartDto(cart: CartRecord) {
    const subtotal = this.cartSubtotal(cart);
    return {
      id: cart.id,
      branchId: cart.branchId,
      customerId: cart.customerId ?? null,
      tableToken: cart.tableToken ?? null,
      expiresAt: cart.expiresAt,
      items: cart.items.map((line) => ({
        id: line.id,
        productId: line.productId,
        name: line.name,
        station: line.station,
        note: line.note ?? null,
        quantity: line.quantity,
        unitPrice: money(line.unitPrice),
        lineTotal: money(line.lineTotal),
      })),
      itemCount: cart.items.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: money(subtotal),
      discount: money(0),
      tax: money(0),
      total: money(subtotal),
    };
  }

  orderDto(order: DemoOrder): OrderDto {
    return {
      id: order.id,
      branchId: order.branchId,
      branchName:
        this.data.branches.find((item) => item.id === order.branchId)?.name ??
        '',
      customerId: order.customerId ?? null,
      customerName: order.customerName ?? null,
      ticketNumber: order.ticketNumber,
      fulfilmentMode: order.fulfilmentMode,
      tableLabel: order.tableLabel ?? null,
      status: order.status,
      allowedTransitions: ORDER_TRANSITIONS[order.status] ?? [],
      paymentMethod: order.paymentMethod ?? null,
      refunded: order.refunded ? money(order.refunded) : null,
      note: order.note ?? null,
      pickupAt: order.pickupAt ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        station: item.station,
        quantity: item.quantity,
        note: item.note ?? null,
        modifiers: item.modifiers,
        unitPrice: money(item.unitPrice),
        lineTotal: money(item.lineTotal),
      })),
      subtotal: money(order.subtotal),
      discount: money(order.discount),
      tax: money(order.tax),
      total: money(order.total),
    };
  }

  private receiptDto(receipt: ReceiptRecord) {
    return {
      id: receipt.id,
      orderId: receipt.orderId,
      receiptNo: receipt.receiptNo,
      channel: receipt.channel,
      printedAt: receipt.printedAt,
    };
  }

  private nextTicketNumber(branchId: string) {
    const branchOrders = this.orders.filter(
      (order) => order.branchId === branchId,
    );
    const highest = branchOrders.reduce((max, order) => {
      const value = Number.parseInt(order.ticketNumber, 10);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 8200);
    return String(highest + 1);
  }

  /**
   * Cake capacity is bounded twice: a maximum of two cakes in any single pickup
   * slot, and a maximum of eight across the whole day. Both are checked before a
   * booking is accepted, so `capacity()` can never report more used than the
   * daily limit.
   */
  private assertCakeCapacity(pickupAt: string) {
    const target = pickupAt.slice(0, 10);
    const time = pickupAt.slice(11, 16);
    const sameDay = this.cakeJobs.filter(
      (job) =>
        job.stage !== 'CANCELLED' && job.pickupAt.slice(0, 10) === target,
    );
    if (sameDay.length >= CAKE_CAPACITY_PER_DAY) {
      throw new ConflictException(
        `The cake studio is fully booked on ${target}. Pick another day.`,
      );
    }
    const sameSlot = sameDay.filter(
      (job) => job.pickupAt.slice(11, 16) === time,
    );
    if (sameSlot.length >= CAKE_SLOT_CAPACITY) {
      throw new ConflictException(
        'The selected cake pickup slot is at capacity. Pick another time.',
      );
    }
  }

  private assertTransition(
    transitions: Record<string, string[]>,
    current: string,
    next: string,
    noun: string,
  ) {
    if (!transitions[current]?.includes(next)) {
      throw new ConflictException(
        `Invalid ${noun} transition from ${current} to ${next}.`,
      );
    }
  }

  private assertManagerPin(pin?: string) {
    const expected = process.env.DEV_MANAGER_PIN ?? '2468';
    if (!pin || pin !== expected) {
      throw new ForbiddenException(
        'Manager authorization is required for this operation.',
      );
    }
  }
  private changePercent(current: number, previous: number) {
    if (!previous) return current ? 100 : 0;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  private revenueSeries(orders: DemoOrder[], days: number) {
    const buckets = new Map<string, { revenue: number; orders: number }>();
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = new Date(Date.now() - index * 86400_000)
        .toISOString()
        .slice(0, 10);
      buckets.set(date, { revenue: 0, orders: 0 });
    }
    for (const order of orders) {
      if (order.status === 'CANCELLED') continue;
      const date = order.createdAt.slice(0, 10);
      const bucket = buckets.get(date);
      if (!bucket) continue;
      bucket.revenue += order.total;
      bucket.orders += 1;
    }
    return [...buckets.entries()].map(([date, bucket]) => ({
      date,
      revenue: bucket.revenue,
      orders: bucket.orders,
    }));
  }

  private countByStatus(orders: Array<{ status: string }>) {
    const counts = new Map<string, number>();
    for (const order of orders) {
      counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((left, right) => right.count - left.count);
  }

  private groupCount<T>(items: T[], select: (item: T) => string) {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = select(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count);
  }

  private branchPerformance(orders: DemoOrder[]) {
    return this.data.branches.map((branch) => {
      const scoped = orders.filter((order) => order.branchId === branch.id);
      const revenue = scoped
        .filter((order) => order.status !== 'CANCELLED')
        .reduce((sum, order) => sum + order.total, 0);
      const top = this.topProducts(scoped, 1)[0];
      return {
        branchId: branch.id,
        code: branch.code,
        name: branch.name,
        orderCount: scoped.length,
        revenue: money(revenue),
        averageBasket: money(Math.round(revenue / Math.max(1, scoped.length))),
        topItem: top?.name ?? 'No sales yet',
        sharePercent:
          Math.round((revenue / Math.max(1, this.orders.length)) * 1000) / 10,
      };
    });
  }

  private hourlyHeatmap(orders: DemoOrder[]) {
    const grid: number[][] = Array.from({ length: 7 }, () =>
      Array<number>(24).fill(0),
    );
    for (const order of orders) {
      if (order.status === 'CANCELLED') continue;
      // Asia/Jakarta is UTC+7 all year, so shifting once is exact.
      const local = new Date(
        new Date(order.createdAt).getTime() + 7 * 60 * 60_000,
      );
      const day = grid[local.getUTCDay()];
      const hour = local.getUTCHours();
      day[hour] = (day[hour] ?? 0) + 1;
    }
    const max = Math.max(1, ...grid.flat());
    return {
      max,
      days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      grid: grid.map((row) =>
        row.map((value) => Math.round((value / max) * 100)),
      ),
    };
  }
}
