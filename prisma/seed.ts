import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to seed KEDAI.');

const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
const ids = {
  organization: '00000000-0000-4000-8000-000000000000',
  branch: '00000000-0000-4000-8000-000000000001',
  branchMenteng: '00000000-0000-4000-8000-000000000002',
  categoryCoffee: '01000000-0000-4000-8000-000000000001',
  categoryPastry: '01000000-0000-4000-8000-000000000002',
  categoryCakes: '01000000-0000-4000-8000-000000000003',
  oatLatte: '10000000-0000-4000-8000-000000000001',
  tiramisu: '10000000-0000-4000-8000-000000000002',
  pandanCake: '10000000-0000-4000-8000-000000000003',
  customer: '20000000-0000-4000-8000-000000000001',
  loyalty: '21000000-0000-4000-8000-000000000001',
  ingredientOat: '30000000-0000-4000-8000-000000000001',
  ingredientCoffee: '30000000-0000-4000-8000-000000000002',
  bar: '00000000-0000-4000-8000-000000000101',
  pastry: '00000000-0000-4000-8000-000000000102',
  cake: '00000000-0000-4000-8000-000000000103',
  order: '50000000-0000-4000-8000-000000000001',
  orderCake: '50000000-0000-4000-8000-000000000003',
};

async function main() {
  await prisma.organization.upsert({
    where: { slug: 'kedai' },
    update: { name: 'KEDAI' },
    create: { id: ids.organization, name: 'KEDAI', slug: 'kedai' },
  });

  for (const branch of [
    { id: ids.branch, code: 'SCBD', name: 'KEDAI SCBD', address: 'Jl. Jenderal Sudirman Kav. 52-53, Jakarta' },
    { id: ids.branchMenteng, code: 'MNT', name: 'KEDAI Menteng', address: 'Jl. HOS Cokroaminoto No. 91, Jakarta' },
  ]) {
    await prisma.branch.upsert({
      where: { code: branch.code },
      update: { ...branch, timezone: 'Asia/Jakarta', active: true },
      create: { ...branch, organizationId: ids.organization, timezone: 'Asia/Jakarta', active: true },
    });
  }

  const categories = [
    { id: ids.categoryCoffee, slug: 'coffee', name: 'Coffee', sortOrder: 1 },
    { id: ids.categoryPastry, slug: 'pastry', name: 'Pastry', sortOrder: 2 },
    { id: ids.categoryCakes, slug: 'whole-cakes', name: 'Whole Cakes', sortOrder: 3 },
  ];
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }

  const products = [
    { id: ids.oatLatte, categoryId: ids.categoryCoffee, sku: 'COF-OAT-LATTE', slug: 'oat-latte', name: 'Oat Latte', description: 'Double espresso with creamy barista oat milk.', basePrice: '42000', allergens: ['oats'], imageUrl: '/images/products/oat-latte.jpg' },
    { id: ids.tiramisu, categoryId: ids.categoryPastry, sku: 'PST-TIRAMISU', slug: 'tiramisu-slice', name: 'Tiramisu Slice', description: 'Espresso-soaked sponge, mascarpone and cocoa.', basePrice: '55000', allergens: ['dairy', 'egg', 'gluten'], imageUrl: '/images/products/tiramisu.jpg' },
    { id: ids.pandanCake, categoryId: ids.categoryCakes, sku: 'CAK-PANDAN-18', slug: 'signature-pandan-cake', name: 'Signature Pandan Cake', description: 'Whole pandan chiffon cake with coconut cream.', basePrice: '380000', allergens: ['dairy', 'egg', 'gluten'], leadTimeHours: 48, imageUrl: '/images/products/pandan-cake.jpg' },
  ];
  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: product,
      create: product,
    });
    for (const branchId of [ids.branch, ids.branchMenteng]) {
      await prisma.branchProduct.upsert({
        where: { branchId_productId: { branchId, productId: product.id } },
        update: { price: product.basePrice, available: true },
        create: { branchId, productId: product.id, price: product.basePrice, available: true },
      });
    }
  }

  const staff = [
    { id: '70000000-0000-4000-8000-000000000001', email: 'cashier@kedai.local', name: 'Maya', role: 'CASHIER' as const },
    { id: '70000000-0000-4000-8000-000000000002', email: 'manager@kedai.local', name: 'Dimas', role: 'MANAGER' as const },
    { id: '70000000-0000-4000-8000-000000000003', email: 'admin@kedai.local', name: 'KEDAI Admin', role: 'ADMIN' as const },
  ];
  for (const user of staff) {
    await prisma.staffUser.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, active: true },
      create: {
        ...user,
        branchId: ids.branch,
        pinHash: '$2b$10$xXeXvtAmcqykWX06fazoHOlQANetYxIFYXEC/LYZyuk6aylrinH9O',
      },
    });
  }

  await prisma.customer.upsert({
    where: { phone: '+6281234567890' },
    update: { name: 'Andi Wijaya', whatsappOptIn: true },
    create: {
      id: ids.customer,
      phone: '+6281234567890',
      name: 'Andi Wijaya',
      email: 'andi@example.test',
      whatsappOptIn: true,
      marketingOptIn: true,
    },
  });
  await prisma.loyaltyAccount.upsert({
    where: { customerId: ids.customer },
    update: { points: 842, tier: 'Gold Brew' },
    create: { id: ids.loyalty, customerId: ids.customer, points: 842, tier: 'Gold Brew' },
  });

  for (const station of [
    { id: ids.bar, name: 'Main Bar', type: 'BAR' as const },
    { id: ids.pastry, name: 'Pastry Pass', type: 'PASTRY' as const },
    { id: ids.cake, name: 'Cake Studio', type: 'CAKE' as const },
  ]) {
    await prisma.station.upsert({
      where: { branchId_type: { branchId: ids.branch, type: station.type } },
      update: { name: station.name, active: true },
      create: { ...station, branchId: ids.branch },
    });
  }

  for (const ingredient of [
    { id: ids.ingredientOat, sku: 'ING-OAT-MILK', name: 'Oat Milk – Barista Edition', unit: 'carton', reorderLevel: '8', quantity: '5' },
    { id: ids.ingredientCoffee, sku: 'ING-COFFEE-HOUSE', name: 'KEDAI House Coffee Beans', unit: 'kg', reorderLevel: '6', quantity: '18.5' },
  ]) {
    await prisma.ingredient.upsert({
      where: { sku: ingredient.sku },
      update: { name: ingredient.name, unit: ingredient.unit, reorderLevel: ingredient.reorderLevel },
      create: { id: ingredient.id, sku: ingredient.sku, name: ingredient.name, unit: ingredient.unit, reorderLevel: ingredient.reorderLevel },
    });
    await prisma.inventoryBalance.upsert({
      where: { branchId_ingredientId: { branchId: ids.branch, ingredientId: ingredient.id } },
      update: { quantity: ingredient.quantity },
      create: { branchId: ids.branch, ingredientId: ingredient.id, quantity: ingredient.quantity },
    });
  }

  await prisma.order.upsert({
    where: { branchId_ticketNumber: { branchId: ids.branch, ticketNumber: '8842' } },
    update: { status: 'IN_PREPARATION' },
    create: {
      id: ids.order,
      branchId: ids.branch,
      customerId: ids.customer,
      ticketNumber: '8842',
      fulfilmentMode: 'DINE_IN',
      tableLabel: '04',
      status: 'IN_PREPARATION',
      subtotal: '42000',
      total: '42000',
      items: { create: { productId: ids.oatLatte, name: 'Oat Latte', unitPrice: '42000', quantity: 1, lineTotal: '42000' } },
    },
  });
  await prisma.kitchenTask.upsert({
    where: { id: '40000000-0000-4000-8000-000000000001' },
    update: { status: 'QUEUED' },
    create: {
      id: '40000000-0000-4000-8000-000000000001',
      stationId: ids.bar,
      orderId: ids.order,
      priority: 2,
      payload: { item: 'Oat Latte', modifiers: ['Iced', '+1 shot'], allergens: ['oats'] },
    },
  });

  await prisma.subscriptionPlan.createMany({
    data: [
      { id: '80000000-0000-4000-8000-000000000001', name: 'Daily Brew', price: '495000', includedUnits: 15, rolloverUnits: 2 },
      { id: '80000000-0000-4000-8000-000000000002', name: 'Office Brew', price: '925000', includedUnits: 30, rolloverUnits: 5 },
    ],
    skipDuplicates: true,
  });
  await prisma.notificationTemplate.createMany({
    data: [
      { id: '90000000-0000-4000-8000-000000000001', channel: 'WHATSAPP_SANDBOX', event: 'ORDER_READY', body: 'Your KEDAI order {{ticketNumber}} is ready.' },
      { id: '90000000-0000-4000-8000-000000000002', channel: 'EMAIL_SANDBOX', event: 'RECEIPT_ISSUED', body: 'Thank you for visiting KEDAI. Your receipt is attached.' },
    ],
    skipDuplicates: true,
  });
  await prisma.setting.upsert({
    where: { branchId_key: { branchId: ids.branch, key: 'commerce' } },
    update: { value: { taxIncluded: true, cakeLeadTimeHours: 48, pickupHoldMinutes: 15 } },
    create: { branchId: ids.branch, key: 'commerce', value: { taxIncluded: true, cakeLeadTimeHours: 48, pickupHoldMinutes: 15 } },
  });
}

main()
  .then(() => console.log('KEDAI PostgreSQL seed complete.'))
  .finally(() => prisma.$disconnect());
