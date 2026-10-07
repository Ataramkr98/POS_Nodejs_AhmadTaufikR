/**
 * Deterministic demo dataset for the KEDAI operations API.
 *
 * The generator is seeded with a fixed constant, so every process boots with the
 * same catalogue, order history and production queue. Dates are produced relative
 * to boot time, which keeps the dashboards, reports and queues looking current no
 * matter when the project is deployed or reviewed.
 */

export const BRANCHES = {
  scbd: '00000000-0000-4000-8000-000000000001',
  menteng: '00000000-0000-4000-8000-000000000002',
  kemang: '00000000-0000-4000-8000-000000000003',
} as const;

export const STATIONS = {
  bar: '00000000-0000-4000-8000-000000000101',
  pastry: '00000000-0000-4000-8000-000000000102',
  cake: '00000000-0000-4000-8000-000000000103',
} as const;

export const CATEGORY_IDS = {
  coffee: '40000000-0000-4000-8000-000000000001',
  nonCoffee: '40000000-0000-4000-8000-000000000002',
  pastry: '40000000-0000-4000-8000-000000000003',
  wholeCake: '40000000-0000-4000-8000-000000000004',
} as const;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Mulberry32: small, fast, and stable across platforms. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoBranch {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  timezone: string;
  active: boolean;
  hours: string;
  serviceModes: string[];
}

export interface DemoProduct {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  category: string;
  price: number;
  allergens: string[];
  available: boolean;
  imageUrl: string;
  leadTimeHours: number;
  station: 'BAR' | 'PASTRY' | 'CAKE';
  /** Home-screen merchandising weight; higher sorts first. */
  featured: boolean;
}

export interface DemoOrderItem {
  id: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  note?: string;
  modifiers: string[];
  station: 'BAR' | 'PASTRY' | 'CAKE';
}

export interface DemoOrder {
  id: string;
  branchId: string;
  customerId?: string;
  customerName?: string;
  ticketNumber: string;
  fulfilmentMode: string;
  tableLabel?: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  pickupAt?: string;
  note?: string;
  items: DemoOrderItem[];
  createdAt: string;
  updatedAt: string;
  paymentMethod?: string;
  refunded?: number;
}

export interface DemoCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  whatsappOptIn: boolean;
  marketingOptIn: boolean;
  points: number;
  tier: string;
  totalSpend: number;
  orderCount: number;
  lastVisitAt: string;
  joinedAt: string;
}

export interface DemoCakeJob {
  id: string;
  orderId: string;
  branchId: string;
  customer: string;
  title: string;
  occasion: string;
  stage: string;
  tier: string;
  flavour: string;
  servings: string;
  pickupAt: string;
  pipingMessage: string;
  allergens: string[];
  assignedChef: string;
  depositPaid: number;
  referenceUrls: string[];
  notes: string;
}

export interface DemoIngredient {
  id: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  supplier: string;
  status: string;
  updatedAt: string;
}

export interface DemoKitchenTask {
  id: string;
  stationId: string;
  orderId: string;
  ticketNumber: string;
  station: 'BAR' | 'PASTRY';
  status: string;
  priority: number;
  item: string;
  allergenWarning: string;
  destination: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DemoOccasion {
  id: string;
  customerId: string;
  customerName: string;
  type: string;
  label: string;
  date: string;
  reminders: boolean;
  lastOrderId?: string;
}

export interface DemoSubscription {
  id: string;
  customerId: string;
  customerName: string;
  planId: string;
  plan: string;
  status: string;
  price: number;
  usedUnits: number;
  includedUnits: number;
  rolloverUnits: number;
  renewsAt: string;
}

export interface DemoActivityEvent {
  id: string;
  title: string;
  detail: string;
  category: 'cake' | 'customer' | 'inventory' | 'order';
  href: string;
  occurredAt: string;
}

export interface DemoTableSession {
  id: string;
  branchId: string;
  token: string;
  tableLabel: string;
  status: string;
  cartId?: string;
  openedAt: string;
  guestCount: number;
}

export interface DemoDataset {
  branches: DemoBranch[];
  products: DemoProduct[];
  customers: DemoCustomer[];
  orders: DemoOrder[];
  cakeJobs: DemoCakeJob[];
  ingredients: DemoIngredient[];
  kitchenTasks: DemoKitchenTask[];
  occasions: DemoOccasion[];
  subscriptions: DemoSubscription[];
  activity: DemoActivityEvent[];
  tableSessions: DemoTableSession[];
  displayCase: Array<{
    productId: string;
    name: string;
    quantity: number;
    capacity: number;
    updatedAt: string;
  }>;
  recipes: Array<{
    id: string;
    productId: string;
    name: string;
    yield: number;
    yieldUnit: string;
    lines: Array<{ ingredient: string; quantity: number; unit: string }>;
  }>;
  notificationTemplates: Array<{
    id: string;
    event: string;
    channel: string;
    locale: string;
    body: string;
    active: boolean;
  }>;
  notificationDeliveries: Array<{
    id: string;
    channel: string;
    recipient: string;
    event: string;
    status: string;
    attempts: number;
    createdAt: string;
  }>;
  webhooks: Array<{
    id: string;
    name: string;
    url: string;
    secret: string;
    events: string[];
    active: boolean;
    lastDeliveryStatus: string;
    lastDeliveryAt?: string;
  }>;
  settings: Record<string, unknown>;
}

const PRODUCT_BLUEPRINTS: Array<Omit<DemoProduct, 'id'> & { id: string }> = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    sku: 'COF-OAT-LATTE',
    slug: 'oat-latte',
    name: 'Oat Latte',
    description:
      'Double espresso with creamy barista oat milk and a thin lace of foam.',
    categoryId: CATEGORY_IDS.coffee,
    category: 'Coffee',
    price: 42000,
    allergens: ['oats'],
    available: true,
    imageUrl: '/kedai/oat-latte.jpg',
    leadTimeHours: 0,
    station: 'BAR',
    featured: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    sku: 'COF-FLAT-WHITE',
    slug: 'flat-white',
    name: 'Flat White',
    description: 'Ristretto base, steamed milk, microfoam finish.',
    categoryId: CATEGORY_IDS.coffee,
    category: 'Coffee',
    price: 38000,
    allergens: ['dairy'],
    available: true,
    imageUrl: '/kedai/espresso-machine.png',
    leadTimeHours: 0,
    station: 'BAR',
    featured: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    sku: 'COF-V60-SINGLE',
    slug: 'v60-single-origin',
    name: 'V60 Single Origin',
    description:
      'Rotating Indonesian single origin, brewed to order with a 3:15 ratio.',
    categoryId: CATEGORY_IDS.coffee,
    category: 'Coffee',
    price: 55000,
    allergens: [],
    available: true,
    imageUrl: '/kedai/bottle-shelf.png',
    leadTimeHours: 0,
    station: 'BAR',
    featured: false,
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    sku: 'COF-ESP-TONIC',
    slug: 'espresso-tonic',
    name: 'Espresso Tonic',
    description: 'Cold brew tonic with a single shot and orange peel oil.',
    categoryId: CATEGORY_IDS.coffee,
    category: 'Coffee',
    price: 42000,
    allergens: ['quinine'],
    available: true,
    imageUrl: '/kedai/cafe-table.png',
    leadTimeHours: 0,
    station: 'BAR',
    featured: false,
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    sku: 'COF-COLD-BREW',
    slug: 'cold-brew',
    name: 'Cold Brew',
    description: '18-hour steep over ice with a square of soda optional.',
    categoryId: CATEGORY_IDS.coffee,
    category: 'Coffee',
    price: 36000,
    allergens: [],
    available: true,
    imageUrl: '/kedai/counter-blur.png',
    leadTimeHours: 0,
    station: 'BAR',
    featured: false,
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    sku: 'NCF-MATCHA-LATTE',
    slug: 'matcha-latte',
    name: 'Matcha Latte',
    description: 'Ceremonial grade matcha whisked with steamed milk.',
    categoryId: CATEGORY_IDS.nonCoffee,
    category: 'Non-Coffee',
    price: 44000,
    allergens: ['dairy'],
    available: true,
    imageUrl: '/kedai/barista-blur.png',
    leadTimeHours: 0,
    station: 'BAR',
    featured: false,
  },
  {
    id: '10000000-0000-4000-8000-000000000007',
    sku: 'NCF-CHOC-COLD',
    slug: 'chocolate-cold',
    name: 'Cold Chocolate',
    description: '70%Indonesian chocolate, sea salt and whole milk.',
    categoryId: CATEGORY_IDS.nonCoffee,
    category: 'Non-Coffee',
    price: 40000,
    allergens: ['dairy'],
    available: true,
    imageUrl: '/kedai/cafe-window.png',
    leadTimeHours: 0,
    station: 'BAR',
    featured: false,
  },
  {
    id: '10000000-0000-4000-8000-000000000008',
    sku: 'NCF-TARIGEN',
    slug: 'tarigen-lemon-tea',
    name: 'Tarigen Lemon Tea',
    description: 'House-brewed black tea with fresh lemon and light syrup.',
    categoryId: CATEGORY_IDS.nonCoffee,
    category: 'Non-Coffee',
    price: 28000,
    allergens: [],
    available: true,
    imageUrl: '/kedai/bottle-shelf.png',
    leadTimeHours: 0,
    station: 'BAR',
    featured: false,
  },
  {
    id: '10000000-0000-4000-8000-000000000009',
    sku: 'PST-TIRAMISU',
    slug: 'tiramisu-slice',
    name: 'Tiramisu Slice',
    description: 'Espresso-soaked sponge, mascarpone and bitter cocoa.',
    categoryId: CATEGORY_IDS.pastry,
    category: 'Pastry',
    price: 55000,
    allergens: ['dairy', 'egg', 'gluten'],
    available: true,
    imageUrl: '/kedai/tiramisu-slice.jpg',
    leadTimeHours: 0,
    station: 'PASTRY',
    featured: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000010',
    sku: 'PST-KOUIGN',
    slug: 'kougn-amann',
    name: 'Kouign-Amann',
    description: 'Caramelised Breton pastry baked each morning at 06:00.',
    categoryId: CATEGORY_IDS.pastry,
    category: 'Pastry',
    price: 38000,
    allergens: ['dairy', 'gluten'],
    available: true,
    imageUrl: '/kedai/pastry-thumb-pandan.png',
    leadTimeHours: 0,
    station: 'PASTRY',
    featured: false,
  },
  {
    id: '10000000-0000-4000-8000-000000000011',
    sku: 'PST-PANDAN-SLICE',
    slug: 'pandan-slice',
    name: 'Pandan Slice',
    description: 'Sliced pandan chiffon with pandan-infused coconut cream.',
    categoryId: CATEGORY_IDS.pastry,
    category: 'Pastry',
    price: 42000,
    allergens: ['dairy', 'egg', 'gluten'],
    available: true,
    imageUrl: '/kedai/pastry-thumb-pandan.png',
    leadTimeHours: 0,
    station: 'PASTRY',
    featured: false,
  },
  {
    id: '10000000-0000-4000-8000-000000000012',
    sku: 'CAK-PANDAN-18',
    slug: 'signature-pandan-cake',
    name: 'Signature Pandan Cake 18cm',
    description:
      'Whole pandan chiffon cake with coconut cream, serves 16 to 20 people.',
    categoryId: CATEGORY_IDS.wholeCake,
    category: 'Whole Cakes',
    price: 380000,
    allergens: ['dairy', 'egg', 'gluten'],
    available: true,
    imageUrl: '/kedai/pandan-cake.jpg',
    leadTimeHours: 48,
    station: 'CAKE',
    featured: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000013',
    sku: 'CAK-VALRHONA-25',
    slug: 'valrhona-dark-chocolate-cake',
    name: 'Valrhona Dark Chocolate 25cm',
    description:
      'Two-layer 70% Valrhona cake with salted ganache, serves 24 to 30.',
    categoryId: CATEGORY_IDS.wholeCake,
    category: 'Whole Cakes',
    price: 720000,
    allergens: ['dairy', 'egg', 'gluten', 'soy'],
    available: true,
    imageUrl: '/kedai/cake-reference-2.png',
    leadTimeHours: 72,
    station: 'CAKE',
    featured: false,
  },
  {
    id: '10000000-0000-4000-8000-000000000014',
    sku: 'CAK-VEG-CARROT',
    slug: 'vegan-carrot-cake',
    name: 'Vegan Carrot Cake 20cm',
    description:
      'Plant-based sponge with cashew frosting and candied carrot, serves 16.',
    categoryId: CATEGORY_IDS.wholeCake,
    category: 'Whole Cakes',
    price: 465000,
    allergens: ['gluten', 'cashew'],
    available: true,
    imageUrl: '/kedai/cake-reference-3.png',
    leadTimeHours: 48,
    station: 'CAKE',
    featured: false,
  },
];

const CUSTOMER_BLUEPRINTS = [
  [
    'Andi Wijaya',
    '+6281234567890',
    'andi.wijaya@example.com',
    'Gold Brew',
    1842,
  ],
  [
    'Sarah Amelia',
    '+6281234567891',
    'sarah.amelia@example.com',
    'Gold Brew',
    1520,
  ],
  [
    'Dewi Lestari',
    '+6281234567892',
    'dewi.lestari@example.com',
    'Daily Brew',
    960,
  ],
  [
    'Bagus Prakoso',
    '+6281234567893',
    'bagus.prakoso@example.com',
    'Daily Brew',
    640,
  ],
  ['Rina Kartika', '+6281234567894', 'rina.kartika@example.com', 'Brew', 320],
  [
    'TechX Office',
    '+6281234567895',
    'ops@techx.example.com',
    'Gold Brew',
    2410,
  ],
  ['Bagusramadhan', '+6281234567896', 'ramadhan@example.com', 'Brew', 145],
  [
    'Melati Sari',
    '+6281234567897',
    'melati.sari@example.com',
    'Daily Brew',
    780,
  ],
] as const;

const CHEFS = ['Reza', 'Nadia', 'Bimo', 'Citra'] as const;

const INGREDIENT_BLUEPRINTS: Array<
  [string, string, string, number, number, string]
> = [
  [
    'ING-OAT-MILK',
    'Oat Milk Barista Edition',
    'carton',
    5,
    8,
    'Susu-oat Nusantara',
  ],
  [
    'ING-COFFEE-HOUSE',
    'KEDAI House Coffee Beans',
    'kg',
    18.5,
    6,
    'Koperasi Tani Highlands',
  ],
  ['ING-PANDAN', 'Pandan Paste', 'kg', 1.2, 2, 'Rempah Nusantara'],
  ['ING-DAIRY-FULL', 'Full Cream Milk', 'litre', 42, 20, 'PT Susu Jakarta'],
  ['ING-BUTTER', 'Butter Isigny', 'kg', 3.4, 5, 'Delice France'],
  ['ING-VALRHONA', 'Valrhona 70% Chocolate', 'kg', 6.2, 4, 'Valrhona EU'],
  ['ING-COCONUT-CREAM', 'Coconut Cream', 'litre', 14, 8, 'Buah Hutan Jaya'],
  ['ING-FLOUR', 'Bread Flour 00', 'kg', 22, 15, 'PT Terang Bogel'],
  ['ING-CASHEW', 'Cashew Nuts', 'kg', 2.1, 3, 'Nuts Prima'],
  ['ING-EGGS', 'Free Range Eggs', 'tray', 9, 6, 'Java Free Range Farms'],
  ['ING-SUGAR', 'Caster Sugar', 'kg', 31, 20, 'Gula Indonesia'],
  ['ING-MATCHA', 'Ceremonial Matcha', 'tin', 2, 3, 'Uji Matcha Kyoto'],
];

const OCCASION_BLUEPRINTS = [
  ['Andi Wijaya', 'BIRTHDAY', 'Andi · 32nd birthday', 6, true],
  ['Sarah Amelia', 'ANNIVERSARY', 'Sarah & Bagus · 5 years', 21, true],
  ['Dewi Lestari', 'BIRTHDAY', 'Dewi · 28th birthday', 34, true],
  ['Bagus Prakoso', 'GRADUATION', 'Bagus · graduation', 48, false],
  ['Melati Sari', 'BIRTHDAY', 'Melati · 25th birthday', 12, true],
  ['TechX Office', 'ANNIVERSARY', 'TechX · company anniversary', 73, true],
] as const;

export const SUBSCRIPTION_PLANS = [
  {
    id: 'plan-daily-brew',
    name: 'Daily Brew',
    price: 495000,
    includedUnits: 15,
    rolloverUnits: 2,
    description: 'Fifteen barista drinks a month at counter price.',
  },
  {
    id: 'plan-office-brew',
    name: 'Office Brew',
    price: 925000,
    includedUnits: 30,
    rolloverUnits: 5,
    description: 'Thirty drinks a month with priority cake slots.',
  },
  {
    id: 'plan-weekly-pastry',
    name: 'Weekly Pastry',
    price: 268000,
    includedUnits: 4,
    rolloverUnits: 0,
    description: 'One pastry box every week, collected on your day.',
  },
] as const;

const ORDER_STATUS_PLAN: Array<[string, number]> = [
  ['FULFILLED', 62],
  ['READY', 6],
  ['IN_PREPARATION', 8],
  ['ACCEPTED', 5],
  ['PAID', 5],
  ['PENDING_PAYMENT', 4],
  ['PARTIALLY_REFUNDED', 3],
  ['REFUNDED', 4],
  ['CANCELLED', 3],
];

function pickWeighted<T extends string>(
  random: () => number,
  plan: Array<[T, number]>,
): T {
  const total = plan.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of plan) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return plan[plan.length - 1][0];
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length) % values.length];
}

/**
 * Builds the full demo dataset. `now` is injected so tests can pin the clock and
 * so the generated history stays relative to a single instant.
 */
export function buildDemoDataset(now = new Date()): DemoDataset {
  const random = createRandom(20260214);
  const startedAt = now.getTime() - 45 * DAY;

  const branches: DemoBranch[] = [
    {
      id: BRANCHES.scbd,
      code: 'SCBD',
      name: 'KEDAI SCBD',
      address: 'Jl. Jenderal Sudirman Kav. 52-53, Jakarta Selatan',
      phone: '+62 21 555 0194',
      timezone: 'Asia/Jakarta',
      active: true,
      hours: '07:00-22:00',
      serviceModes: ['DINE_IN', 'TAKEAWAY', 'PRE_ORDER'],
    },
    {
      id: BRANCHES.menteng,
      code: 'MNT',
      name: 'KEDAI Menteng',
      address: 'Jl. HOS Cokroaminoto No. 91, Jakarta Pusat',
      phone: '+62 21 555 0195',
      timezone: 'Asia/Jakarta',
      active: true,
      hours: '07:00-21:00',
      serviceModes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
    },
    {
      id: BRANCHES.kemang,
      code: 'KMG',
      name: 'KEDAI Kemang',
      address: 'Jl. Kemang Raya No. 12, Jakarta Selatan',
      phone: '+62 21 555 0196',
      timezone: 'Asia/Jakarta',
      active: true,
      hours: '08:00-21:00',
      serviceModes: ['TAKEAWAY', 'DELIVERY'],
    },
  ];

  const products: DemoProduct[] = PRODUCT_BLUEPRINTS.map((product) => ({
    ...product,
    allergens: [...product.allergens],
  }));

  const customers: DemoCustomer[] = CUSTOMER_BLUEPRINTS.map(
    ([name, phone, email, tier, points], index) => {
      const orderCount = 4 + Math.floor(random() * 40);
      const average = 62000 + Math.floor(random() * 90000);
      return {
        id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        name,
        phone,
        email,
        whatsappOptIn: index !== 6,
        marketingOptIn: index % 3 !== 0,
        points,
        tier,
        totalSpend: orderCount * average,
        orderCount,
        lastVisitAt: new Date(
          now.getTime() - Math.floor(random() * 12 * DAY),
        ).toISOString(),
        joinedAt: new Date(
          now.getTime() - Math.floor(random() * 400 * DAY) - 30 * DAY,
        ).toISOString(),
      };
    },
  );

  const orders = buildOrders(random, now, startedAt, products, customers);
  orders.unshift(...buildLiveOrders(products, customers, random));
  const cakeJobs = buildCakeJobs(random, now);
  const ingredients: DemoIngredient[] = INGREDIENT_BLUEPRINTS.map(
    ([sku, name, unit, quantity, reorderLevel, supplier], index) => ({
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      sku,
      name,
      unit,
      quantity,
      reorderLevel,
      supplier,
      status: quantity <= reorderLevel ? 'LOW_STOCK' : 'HEALTHY',
      updatedAt: new Date(
        now.getTime() - Math.floor(random() * 5 * DAY),
      ).toISOString(),
    }),
  );

  const kitchenTasks = buildKitchenTasks(orders, now, random);

  const occasions: DemoOccasion[] = OCCASION_BLUEPRINTS.map(
    ([customerName, type, label, offset, reminders], index) => {
      const customer = customers.find((item) => item.name === customerName);
      const order = orders.find((item) => item.customerName === customerName);
      return {
        id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        customerId: customer?.id ?? customers[0].id,
        customerName,
        type,
        label,
        date: new Date(now.getTime() + offset * DAY).toISOString(),
        reminders,
        lastOrderId: order?.id,
      };
    },
  );

  const subscriptions = [
    {
      id: '80000000-0000-4000-8000-000000000001',
      customerId: customers[0].id,
      customerName: customers[0].name,
      planId: SUBSCRIPTION_PLANS[1].id,
      plan: SUBSCRIPTION_PLANS[1].name,
      status: 'ACTIVE',
      price: SUBSCRIPTION_PLANS[1].price,
      usedUnits: 18,
      includedUnits: SUBSCRIPTION_PLANS[1].includedUnits,
      rolloverUnits: 3,
      renewsAt: new Date(now.getTime() + 9 * DAY).toISOString(),
    },
    {
      id: '80000000-0000-4000-8000-000000000002',
      customerId: customers[1].id,
      customerName: customers[1].name,
      planId: SUBSCRIPTION_PLANS[0].id,
      plan: SUBSCRIPTION_PLANS[0].name,
      status: 'ACTIVE',
      price: SUBSCRIPTION_PLANS[0].price,
      usedUnits: 9,
      includedUnits: SUBSCRIPTION_PLANS[0].includedUnits,
      rolloverUnits: 1,
      renewsAt: new Date(now.getTime() + 16 * DAY).toISOString(),
    },
    {
      id: '80000000-0000-4000-8000-000000000003',
      customerId: customers[5].id,
      customerName: customers[5].name,
      planId: SUBSCRIPTION_PLANS[1].id,
      plan: SUBSCRIPTION_PLANS[1].name,
      status: 'PAUSED',
      price: SUBSCRIPTION_PLANS[1].price,
      usedUnits: 30,
      includedUnits: SUBSCRIPTION_PLANS[1].includedUnits,
      rolloverUnits: 5,
      renewsAt: new Date(now.getTime() + 3 * DAY).toISOString(),
    },
    {
      id: '80000000-0000-4000-8000-000000000004',
      customerId: customers[7].id,
      customerName: customers[7].name,
      planId: SUBSCRIPTION_PLANS[2].id,
      plan: SUBSCRIPTION_PLANS[2].name,
      status: 'ACTIVE',
      price: SUBSCRIPTION_PLANS[2].price,
      usedUnits: 2,
      includedUnits: SUBSCRIPTION_PLANS[2].includedUnits,
      rolloverUnits: 0,
      renewsAt: new Date(now.getTime() + 22 * DAY).toISOString(),
    },
  ];

  const activity = buildActivity(now, cakeJobs, ingredients, orders, customers);
  const tableSessions: DemoTableSession[] = [
    {
      id: '90000000-0000-4000-8000-000000000001',
      branchId: BRANCHES.scbd,
      token: 'TBL-SCBD-04',
      tableLabel: 'Table 04',
      status: 'OPEN',
      openedAt: new Date(now.getTime() - 52 * MINUTE).toISOString(),
      guestCount: 2,
    },
    {
      id: '90000000-0000-4000-8000-000000000002',
      branchId: BRANCHES.scbd,
      token: 'TBL-SCBD-12',
      tableLabel: 'Table 12',
      status: 'OPEN',
      openedAt: new Date(now.getTime() - 18 * MINUTE).toISOString(),
      guestCount: 4,
    },
    {
      id: '90000000-0000-4000-8000-000000000003',
      branchId: BRANCHES.menteng,
      token: 'TBL-MNT-07',
      tableLabel: 'Table 07',
      status: 'BILL_REQUESTED',
      openedAt: new Date(now.getTime() - 96 * MINUTE).toISOString(),
      guestCount: 6,
    },
  ];

  const displayCase = [
    {
      productId: products.find((item) => item.slug === 'tiramisu-slice')!.id,
      name: 'Tiramisu Slice',
      quantity: 6,
      capacity: 12,
      updatedAt: new Date(now.getTime() - 40 * MINUTE).toISOString(),
    },
    {
      productId: products.find((item) => item.slug === 'pandan-slice')!.id,
      name: 'Pandan Slice',
      quantity: 1,
      capacity: 8,
      updatedAt: new Date(now.getTime() - 40 * MINUTE).toISOString(),
    },
    {
      productId: products.find((item) => item.slug === 'kougn-amann')!.id,
      name: 'Kouign-Amann',
      quantity: 14,
      capacity: 18,
      updatedAt: new Date(now.getTime() - 26 * MINUTE).toISOString(),
    },
  ];

  const recipes = [
    {
      id: 'a1000000-0000-4000-8000-000000000001',
      productId: products.find((item) => item.slug === 'tiramisu-slice')!.id,
      name: 'Tiramisu Slice',
      yield: 12,
      yieldUnit: 'slices',
      lines: [
        { ingredient: 'Mascarpone', quantity: 1.5, unit: 'kg' },
        { ingredient: 'Full Cream Milk', quantity: 0.4, unit: 'litre' },
        { ingredient: 'Free Range Eggs', quantity: 8, unit: 'units' },
        { ingredient: 'Caster Sugar', quantity: 0.2, unit: 'kg' },
        { ingredient: 'KEDAI House Coffee Beans', quantity: 0.18, unit: 'kg' },
      ],
    },
    {
      id: 'a1000000-0000-4000-8000-000000000002',
      productId: products.find((item) => item.slug === 'pandan-slice')!.id,
      name: 'Pandan Slice',
      yield: 16,
      yieldUnit: 'slices',
      lines: [
        { ingredient: 'Bread Flour 00', quantity: 1.2, unit: 'kg' },
        { ingredient: 'Free Range Eggs', quantity: 10, unit: 'units' },
        { ingredient: 'Pandan Paste', quantity: 0.06, unit: 'kg' },
        { ingredient: 'Coconut Cream', quantity: 0.9, unit: 'litre' },
        { ingredient: 'Caster Sugar', quantity: 0.9, unit: 'kg' },
      ],
    },
    {
      id: 'a1000000-0000-4000-8000-000000000003',
      productId: products.find((item) => item.slug === 'signature-pandan-cake')!
        .id,
      name: 'Signature Pandan Cake 18cm',
      yield: 1,
      yieldUnit: 'cake',
      lines: [
        { ingredient: 'Bread Flour 00', quantity: 0.9, unit: 'kg' },
        { ingredient: 'Free Range Eggs', quantity: 12, unit: 'units' },
        { ingredient: 'Pandan Paste', quantity: 0.08, unit: 'kg' },
        { ingredient: 'Butter Isigny', quantity: 0.25, unit: 'kg' },
        { ingredient: 'Coconut Cream', quantity: 1.4, unit: 'litre' },
        { ingredient: 'Caster Sugar', quantity: 0.8, unit: 'kg' },
      ],
    },
    {
      id: 'a1000000-0000-4000-8000-000000000004',
      productId: products.find(
        (item) => item.slug === 'valrhona-dark-chocolate-cake',
      )!.id,
      name: 'Valrhona Dark Chocolate 25cm',
      yield: 1,
      yieldUnit: 'cake',
      lines: [
        { ingredient: 'Valrhona 70% Chocolate', quantity: 0.75, unit: 'kg' },
        { ingredient: 'Butter Isigny', quantity: 0.35, unit: 'kg' },
        { ingredient: 'Free Range Eggs', quantity: 10, unit: 'units' },
        { ingredient: 'Bread Flour 00', quantity: 0.5, unit: 'kg' },
        { ingredient: 'Caster Sugar', quantity: 0.6, unit: 'kg' },
      ],
    },
  ];

  const notificationTemplates = [
    {
      id: 'b1000000-0000-4000-8000-000000000001',
      event: 'ORDER_READY',
      channel: 'WHATSAPP',
      locale: 'en-ID',
      body: 'Hi {name}, order #{ticket} is ready for pickup at KEDAI {branch}.',
      active: true,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000002',
      event: 'CAKE_APPROVED',
      channel: 'WHATSAPP',
      locale: 'en-ID',
      body: 'Hi {name}, your cake design is approved and booked for {pickup}.',
      active: true,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000003',
      event: 'RECEIPT_ISSUED',
      channel: 'EMAIL',
      locale: 'en-ID',
      body: 'Your KEDAI receipt for order #{ticket} is attached.',
      active: true,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000004',
      event: 'LOW_STOCK',
      channel: 'WHATSAPP',
      locale: 'en-ID',
      body: 'Inventory alert: {ingredient} is at {quantity} {unit} at {branch}.',
      active: false,
    },
  ];

  const notificationDeliveries = orders.slice(0, 6).map((order, index) => ({
    id: `c1000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    channel: index % 2 === 0 ? 'WHATSAPP' : 'EMAIL',
    recipient: maskPhone(
      customers.find((item) => item.id === order.customerId)?.phone ?? '',
    ),
    event: 'ORDER_READY',
    status: index === 3 ? 'FAILED' : 'SENT',
    attempts: index === 3 ? 3 : 1,
    createdAt: order.createdAt,
  }));

  const webhooks = [
    {
      id: 'd1000000-0000-4000-8000-000000000001',
      name: 'Merchant analytics sink',
      url: 'https://hooks.example.com/kedai/events',
      secret: 'whsec_demo_analytics_2026',
      events: ['order.settled', 'order.refunded'],
      active: true,
      lastDeliveryStatus: 'SENT',
      lastDeliveryAt: new Date(now.getTime() - 3 * HOUR).toISOString(),
    },
    {
      id: 'd1000000-0000-4000-8000-000000000002',
      name: 'Kitchen display backup',
      url: 'https://hooks.example.com/kedai/kds',
      secret: 'whsec_demo_kitchen_2026',
      events: ['task.changed'],
      active: false,
      lastDeliveryStatus: 'FAILED',
      lastDeliveryAt: new Date(now.getTime() - 2 * DAY).toISOString(),
    },
  ];

  const settings: Record<string, unknown> = {
    organization: {
      name: 'KEDAI',
      legalName: 'KEDAI Specialty Cafe & Bakery',
      locale: 'en-ID',
      currency: 'IDR',
      timezone: 'Asia/Jakarta',
    },
    commerce: {
      taxIncluded: true,
      taxRate: 0.11,
      cakeLeadTimeHours: 48,
      pickupHoldMinutes: 15,
      minimumCafeOrder: 50000,
    },
    integrations: {
      payments: 'sandbox',
      whatsapp: 'sandbox',
      email: 'sandbox',
      storage: 'object-storage',
    },
    realtime: { enabled: true, resyncOnReconnect: true },
    pos: {
      receiptWidthMm: 58,
      printerName: 'Cashier 01 · Epson TM-T88',
      offlineMode: false,
    },
  };

  return {
    branches,
    products,
    customers,
    orders,
    cakeJobs,
    ingredients,
    kitchenTasks,
    occasions,
    subscriptions,
    activity,
    tableSessions,
    displayCase,
    recipes,
    notificationTemplates,
    notificationDeliveries,
    webhooks,
    settings,
  };
}

function maskPhone(phone: string) {
  if (phone.length < 9) return phone;
  return `${phone.slice(0, 7)}****${phone.slice(-3)}`;
}

function buildOrders(
  random: () => number,
  now: Date,
  startedAt: number,
  products: DemoProduct[],
  customers: DemoCustomer[],
): DemoOrder[] {
  const orders: DemoOrder[] = [];
  const barProducts = products.filter((item) => item.station !== 'CAKE');
  const cakeProducts = products.filter((item) => item.station === 'CAKE');
  const target = 180;
  let ticket = 8200;

  for (let index = 0; index < target; index += 1) {
    // Cluster orders around the morning and afternoon rushes for a believable curve.
    const dayOffset = Math.floor((index / target) * 30);
    const base = startedAt + dayOffset * DAY;
    const rushHour =
      random() < 0.55
        ? 8 + Math.floor(random() * 4)
        : 14 + Math.floor(random() * 5);
    const created = base + rushHour * HOUR + Math.floor(random() * 50 * MINUTE);
    if (created >= now.getTime() - 5 * MINUTE) break;

    const status = pickWeighted(random, ORDER_STATUS_PLAN);
    const isCakeOrder = random() < 0.12;
    const source = isCakeOrder ? cakeProducts : barProducts;
    const lineCount = 1 + Math.floor(random() * (isCakeOrder ? 1 : 3));
    const items: DemoOrderItem[] = [];
    let subtotal = 0;

    for (let line = 0; line < lineCount; line += 1) {
      const product = pick(random, source);
      const quantity = isCakeOrder ? 1 : 1 + Math.floor(random() * 2);
      const modifiers =
        product.station === 'BAR'
          ? pick(random, [
              ['Iced', 'Regular milk'],
              ['Hot', 'Oat milk'],
              ['Iced', 'Less ice'],
              ['Hot'],
            ])
          : [];
      const unitPrice = product.price;
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      items.push({
        id: `5e000000-0000-4000-8000-${(index * 8 + line + 1)
          .toString(16)
          .padStart(12, '0')}`,
        productId: product.id,
        name: product.name,
        unitPrice,
        quantity,
        lineTotal,
        modifiers,
        station: product.station === 'CAKE' ? 'CAKE' : product.station,
        note: random() < 0.18 ? 'Less sugar please' : undefined,
      });
    }

    const discount =
      random() < 0.12 ? Math.round((subtotal * 0.1) / 500) * 500 : 0;
    const customer = random() < 0.7 ? pick(random, customers) : undefined;
    const fulfilmentMode = pick(random, [
      'DINE_IN',
      'TAKEAWAY',
      'TAKEAWAY',
      'PRE_ORDER',
      'DELIVERY',
    ]);

    orders.push({
      id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      branchId: pick(random, [
        BRANCHES.scbd,
        BRANCHES.scbd,
        BRANCHES.scbd,
        BRANCHES.menteng,
        BRANCHES.kemang,
      ]),
      customerId: customer?.id,
      customerName: customer?.name,
      ticketNumber: String(ticket++),
      fulfilmentMode,
      tableLabel:
        fulfilmentMode === 'DINE_IN'
          ? `Table ${String(1 + Math.floor(random() * 18)).padStart(2, '0')}`
          : undefined,
      status,
      subtotal,
      discount,
      tax: 0,
      total: subtotal - discount,
      pickupAt:
        fulfilmentMode === 'PRE_ORDER'
          ? new Date(created + 6 * HOUR).toISOString()
          : undefined,
      note:
        random() < 0.08 ? 'Customer requested a separate receipt' : undefined,
      items,
      createdAt: new Date(created).toISOString(),
      updatedAt: new Date(created + 6 * MINUTE).toISOString(),
      paymentMethod:
        status === 'PENDING_PAYMENT' || status === 'CANCELLED'
          ? undefined
          : pick(random, ['QRIS', 'QRIS', 'CASH', 'CARD', 'GO-PAY']),
      refunded:
        status === 'REFUNDED'
          ? subtotal - discount
          : status === 'PARTIALLY_REFUNDED'
            ? Math.round(((subtotal - discount) * 0.4) / 500) * 500
            : undefined,
    });
  }

  return orders.sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function buildCakeJobs(random: () => number, now: Date): DemoCakeJob[] {
  const blueprints = [
    {
      customer: 'Sarah Amelia',
      title: "Sarah's 30th Birthday",
      occasion: 'BIRTHDAY',
      tier: '2 Tier',
      flavour: 'Valrhona Dark Chocolate',
      servings: '24 to 30',
      stage: 'BAKING',
      pickupOffset: 26 * HOUR,
      chefIndex: 0,
      message: 'Thirty & thriving',
      allergens: ['dairy', 'egg', 'gluten', 'soy'],
      references: [
        '/kedai/cake-reference-1.png',
        '/kedai/cake-reference-2.png',
      ],
      deposit: 360000,
      notes: 'Fondant topper with hand-piped florals. Confirm lettering twice.',
    },
    {
      customer: 'Andi Wijaya',
      title: 'Andi · Birthday Celebration',
      occasion: 'BIRTHDAY',
      tier: '1 Tier',
      flavour: 'Pandan Coconut',
      servings: '16 to 20',
      stage: 'DECORATING',
      pickupOffset: 52 * HOUR,
      chefIndex: 1,
      message: 'Selamat Ulang Tahun',
      allergens: ['dairy', 'egg', 'gluten'],
      references: ['/kedai/pandan-cake.jpg'],
      deposit: 190000,
      notes: 'Semi-naked finish, fresh jasmine on top.',
    },
    {
      customer: 'TechX Office',
      title: 'TechX Launch Cake',
      occasion: 'CORPORATE',
      tier: '2 Tier',
      flavour: 'Earl Grey Lavender',
      servings: '30 to 40',
      stage: 'REVIEW',
      pickupOffset: 76 * HOUR,
      chefIndex: 2,
      message: 'Ship it',
      allergens: ['dairy', 'egg', 'gluten', 'nuts'],
      references: ['/kedai/cake-reference-3.png'],
      deposit: 360000,
      notes:
        'Custom logo topper supplied as an SVG. Nuts in the praline layer.',
    },
    {
      customer: 'Dewi Lestari',
      title: 'Anniversary Cake',
      occasion: 'ANNIVERSARY',
      tier: '1 Tier',
      flavour: 'Chocolate Vanilla',
      servings: '10 to 15',
      stage: 'APPROVED',
      pickupOffset: 100 * HOUR,
      chefIndex: 3,
      message: 'To 10 more years of us',
      allergens: ['dairy', 'egg', 'gluten'],
      references: [],
      deposit: 200000,
      notes: 'Minimalist white finish, no nuts.',
    },
    {
      customer: 'Melati Sari',
      title: 'Vegan Carrot Cake',
      occasion: 'BIRTHDAY',
      tier: '1 Tier',
      flavour: 'Vegan Carrot',
      servings: '16 to 20',
      stage: 'READY',
      pickupOffset: 4 * HOUR,
      chefIndex: 0,
      message: 'Twenty five',
      allergens: ['gluten', 'cashew'],
      references: ['/kedai/cake-reference-3.png'],
      deposit: 232500,
      notes: 'Cashew frosting. Keep refrigerated until pickup.',
    },
    {
      customer: 'Bagus Prakoso',
      title: 'Graduation Cake',
      occasion: 'GRADUATION',
      tier: '1 Tier',
      flavour: 'Chocolate Vanilla',
      servings: '16 to 20',
      stage: 'PICKED_UP',
      pickupOffset: -26 * HOUR,
      chefIndex: 1,
      message: 'Congrats!',
      allergens: ['dairy', 'egg', 'gluten'],
      references: [],
      deposit: 200000,
      notes: 'Collected by the customer on the previous day.',
    },
  ];

  return blueprints.map((blueprint, index) => ({
    id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    orderId: `5f000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    branchId: BRANCHES.scbd,
    customer: blueprint.customer,
    title: blueprint.title,
    occasion: blueprint.occasion,
    stage: blueprint.stage,
    tier: blueprint.tier,
    flavour: blueprint.flavour,
    servings: blueprint.servings,
    pickupAt: new Date(now.getTime() + blueprint.pickupOffset).toISOString(),
    pipingMessage: blueprint.message,
    allergens: blueprint.allergens,
    assignedChef: CHEFS[blueprint.chefIndex],
    depositPaid: blueprint.deposit,
    referenceUrls: blueprint.references,
    notes: blueprint.notes,
  }));
}

/**
 * Orders created in the last few minutes, so the kitchen screens, the terminal
 * ticket rail and the "open" reporting bucket are never empty on a fresh boot.
 */
function buildLiveOrders(
  products: DemoProduct[],
  customers: DemoCustomer[],
  random: () => number,
): DemoOrder[] {
  const plan: Array<{
    minutesAgo: number;
    status: string;
    fulfilmentMode: string;
    station: 'BAR' | 'PASTRY';
    skus: string[];
    tableLabel?: string;
    customerIndex: number;
  }> = [
    {
      minutesAgo: 2,
      status: 'PAID',
      fulfilmentMode: 'TAKEAWAY',
      station: 'BAR',
      skus: ['flat-white', 'cold-brew'],
      customerIndex: 1,
    },
    {
      minutesAgo: 5,
      status: 'ACCEPTED',
      fulfilmentMode: 'DINE_IN',
      station: 'BAR',
      skus: ['oat-latte'],
      tableLabel: 'Table 04',
      customerIndex: 3,
    },
    {
      minutesAgo: 7,
      status: 'IN_PREPARATION',
      fulfilmentMode: 'DINE_IN',
      station: 'BAR',
      skus: ['espresso-tonic', 'tarigen-lemon-tea'],
      tableLabel: 'Table 12',
      customerIndex: 5,
    },
    {
      minutesAgo: 11,
      status: 'IN_PREPARATION',
      fulfilmentMode: 'TAKEAWAY',
      station: 'PASTRY',
      skus: ['tiramisu-slice'],
      customerIndex: 2,
    },
    {
      minutesAgo: 14,
      status: 'READY',
      fulfilmentMode: 'TAKEAWAY',
      station: 'BAR',
      skus: ['matcha-latte'],
      customerIndex: 0,
    },
    {
      minutesAgo: 18,
      status: 'ACCEPTED',
      fulfilmentMode: 'PRE_ORDER',
      station: 'PASTRY',
      skus: ['kougn-amann', 'pandan-slice'],
      customerIndex: 6,
    },
    {
      minutesAgo: 23,
      status: 'PENDING_PAYMENT',
      fulfilmentMode: 'DINE_IN',
      station: 'BAR',
      skus: ['chocolate-cold'],
      tableLabel: 'Table 07',
      customerIndex: 4,
    },
    {
      minutesAgo: 31,
      status: 'IN_PREPARATION',
      fulfilmentMode: 'DELIVERY',
      station: 'BAR',
      skus: ['v60-single-origin'],
      customerIndex: 5,
    },
    {
      minutesAgo: 38,
      status: 'PAID',
      fulfilmentMode: 'TAKEAWAY',
      station: 'PASTRY',
      skus: ['tiramisu-slice', 'kougn-amann'],
      customerIndex: 7,
    },
  ];

  let ticket = 9100;

  return plan.map((entry, index) => {
    const createdAt = new Date(
      Date.now() - entry.minutesAgo * MINUTE,
    ).toISOString();
    const items: DemoOrderItem[] = entry.skus.map((slug, line) => {
      const product = products.find((item) => item.slug === slug)!;
      return {
        id: `5d000000-0000-4000-8000-${(index * 4 + line + 1)
          .toString(16)
          .padStart(12, '0')}`,
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        quantity: 1,
        lineTotal: product.price,
        modifiers:
          line === 0 && entry.station === 'BAR' ? ['Iced', 'Less ice'] : [],
        station: entry.station,
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const customer = customers[entry.customerIndex];

    return {
      id: `51000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      branchId: BRANCHES.scbd,
      customerId: customer.id,
      customerName: customer.name,
      ticketNumber: String(ticket++),
      fulfilmentMode: entry.fulfilmentMode,
      tableLabel: entry.tableLabel,
      status: entry.status,
      subtotal,
      discount: 0,
      tax: 0,
      total: subtotal,
      pickupAt:
        entry.fulfilmentMode === 'PRE_ORDER'
          ? new Date(Date.now() + 6 * HOUR).toISOString()
          : undefined,
      items,
      createdAt,
      updatedAt: createdAt,
      paymentMethod:
        entry.status === 'PENDING_PAYMENT'
          ? undefined
          : pick(random, ['QRIS', 'CASH', 'CARD']),
    };
  });
}

function buildKitchenTasks(
  orders: DemoOrder[],
  now: Date,
  random: () => number,
): DemoKitchenTask[] {
  const openStatuses = new Set([
    'PAID',
    'ACCEPTED',
    'IN_PREPARATION',
    'READY',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
  ]);
  const tasks: DemoKitchenTask[] = [];
  let index = 0;

  for (const order of orders) {
    if (!openStatuses.has(order.status)) continue;
    const createdAt = new Date(order.createdAt).getTime();
    const minutesAgo = (now.getTime() - createdAt) / MINUTE;
    if (minutesAgo > 45) continue;

    for (const item of order.items) {
      if (item.station === 'CAKE') continue;
      const late = minutesAgo > 12;
      tasks.push({
        id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        stationId: item.station === 'BAR' ? STATIONS.bar : STATIONS.pastry,
        orderId: order.id,
        ticketNumber: order.ticketNumber,
        station: item.station,
        status:
          minutesAgo > 3
            ? 'IN_PROGRESS'
            : order.status === 'READY'
              ? 'DONE'
              : 'QUEUED',
        priority: late ? 2 : minutesAgo > 6 ? 1 : 0,
        item: [
          `${item.quantity}x ${item.name}`,
          ...item.modifiers,
          ...(item.note ? [item.note] : []),
        ].join(' · '),
        allergenWarning:
          order.items.length > 0 &&
          item.name.includes('Latte') &&
          random() < 0.5
            ? 'Confirm oat brand for gluten cross-contact'
            : '',
        destination:
          order.fulfilmentMode === 'DINE_IN'
            ? (order.tableLabel ?? 'Counter')
            : order.fulfilmentMode === 'DELIVERY'
              ? 'Delivery bag'
              : 'Cashier 01',
        createdAt: order.createdAt,
        startedAt: minutesAgo > 3 ? order.createdAt : undefined,
        completedAt: order.status === 'READY' ? order.updatedAt : undefined,
      });
      index += 1;
    }
  }

  return tasks;
}

function buildActivity(
  now: Date,
  cakeJobs: DemoCakeJob[],
  ingredients: DemoIngredient[],
  orders: DemoOrder[],
  customers: DemoCustomer[],
): DemoActivityEvent[] {
  const lowStock = ingredients.filter((item) => item.status === 'LOW_STOCK');
  const events: Array<Omit<DemoActivityEvent, 'id' | 'occurredAt'>> = [
    {
      title: 'Custom cake awaiting approval',
      detail: `${cakeJobs.find((job) => job.stage === 'REVIEW')?.title ?? 'Custom cake'} needs an allergen and design sign-off before baking.`,
      category: 'cake',
      href: '/kds/cakes',
    },
    {
      title: 'Low stock on barista oat milk',
      detail: `${lowStock[0]?.name ?? 'Oat milk'} is below its reorder level at KEDAI SCBD. A purchase order is recommended.`,
      category: 'inventory',
      href: '/admin/inventory',
    },
    {
      title: 'Subscription payment settled',
      detail: `${customers[0].name} renewed the Office Brew plan via QRIS.`,
      category: 'customer',
      href: '/admin/subscriptions',
    },
    {
      title: 'Refund issued',
      detail: `Order #${orders[1]?.ticketNumber ?? '8201'} received a partial refund after a damaged pastry claim.`,
      category: 'order',
      href: '/admin/orders',
    },
    {
      title: 'New loyalty member',
      detail: `${customers[7].name} signed up through the storefront and opted in to WhatsApp updates.`,
      category: 'customer',
      href: '/admin/customers',
    },
    {
      title: 'Cake job moved to decorating',
      detail: `${cakeJobs.find((job) => job.stage === 'DECORATING')?.title ?? 'Custom cake'} is now in the decorating stage.`,
      category: 'cake',
      href: '/kds/cakes',
    },
    {
      title: 'Display case recount completed',
      detail:
        'KEDAI SCBD recount finished with a 0 slice variance on tiramisu.',
      category: 'inventory',
      href: '/admin/inventory/display-case',
    },
    {
      title: 'Webhook delivery failed',
      detail:
        'Kitchen display backup endpoint returned HTTP 500 and will retry in 15 minutes.',
      category: 'order',
      href: '/admin/webhooks',
    },
  ];

  return events.map((event, index) => ({
    ...event,
    id: `f0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    occurredAt: new Date(
      now.getTime() - (index * 17 + 4) * MINUTE,
    ).toISOString(),
  }));
}
