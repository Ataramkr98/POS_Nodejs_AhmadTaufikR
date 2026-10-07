import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const FULFILMENT_MODES = [
  'DINE_IN',
  'TAKEAWAY',
  'DELIVERY',
  'PRE_ORDER',
] as const;
const PAYMENT_METHODS = ['CASH', 'CARD', 'QRIS', 'TRANSFER'] as const;

// ── Query ─────────────────────────────────────────────────────────────────────

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CatalogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'Coffee' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  available?: boolean;

  @ApiPropertyOptional({ enum: ['price_asc', 'price_desc', 'name_asc'] })
  @IsOptional()
  @IsIn(['price_asc', 'price_desc', 'name_asc'])
  sort?: 'price_asc' | 'price_desc' | 'name_asc';
}

export class OrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Order status, or "open" / "closed" for grouped buckets',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ enum: ['newest', 'oldest', 'total_desc'] })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'total_desc'])
  sort?: 'newest' | 'oldest' | 'total_desc';
}

export class SearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stage?: string;
}

export class RangeQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class DateQueryDto {
  @ApiPropertyOptional({ example: '2026-03-14' })
  @IsOptional()
  @IsString()
  date?: string;
}

// ── Cart and checkout ─────────────────────────────────────────────────────────

export class CreateCartDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ example: 'TBL-SCBD-04' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tableToken?: string;
}

export class AddCartItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 99 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1, maximum: 99 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class ApplyDiscountDto {
  @ApiPropertyOptional({ example: 'KEDAI10' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  percent?: number;

  @ApiPropertyOptional({ description: 'Required for manual discounts' })
  @IsOptional()
  @IsString()
  managerPin?: string;
}

export class CheckoutDto {
  @ApiProperty({ enum: FULFILMENT_MODES })
  @IsIn(FULFILMENT_MODES)
  fulfilmentMode!: (typeof FULFILMENT_MODES)[number];

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  pickupAt?: string;

  @ApiPropertyOptional({ example: 'Table 04' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  tableLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export class PaymentDto {
  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method!: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ description: 'Must equal the server total when sent' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount?: number;
}

export class RefundDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;

  @ApiProperty({ minLength: 4 })
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  reason!: string;

  @ApiProperty({ description: 'Manager PIN required for every refund' })
  @IsString()
  @MinLength(4)
  managerPin!: string;
}

export class TransitionDto {
  @ApiProperty({ example: 'IN_PREPARATION' })
  @IsString()
  status!: string;
}

export class CakeTransitionDto {
  @ApiProperty({ example: 'BAKING' })
  @IsString()
  stage!: string;
}

// ── Catalogue administration ──────────────────────────────────────────────────

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  available?: boolean;
}

// ── Kitchen ───────────────────────────────────────────────────────────────────

export class KdsTicketQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['BAR', 'PASTRY'] })
  @IsOptional()
  @IsIn(['BAR', 'PASTRY'])
  station?: 'BAR' | 'PASTRY';

  @ApiPropertyOptional({ enum: ['QUEUED', 'IN_PROGRESS', 'DONE', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['QUEUED', 'IN_PROGRESS', 'DONE', 'CANCELLED'])
  status?: string;
}

export class ManualTaskDto {
  @ApiProperty({ example: 'Barista walking drink' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  item!: string;

  @ApiPropertyOptional({ enum: ['BAR', 'PASTRY'], default: 'BAR' })
  @IsOptional()
  @IsIn(['BAR', 'PASTRY'])
  station?: 'BAR' | 'PASTRY';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9)
  priority?: number;
}

// ── Cake production ───────────────────────────────────────────────────────────

export class CreateCakeJobDto {
  @ApiProperty({ example: "Sarah's 30th Birthday" })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ example: 'Sarah Amelia' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  customer!: string;

  @ApiProperty({ example: 'BIRTHDAY' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  occasion!: string;

  @ApiProperty({ example: '2 Tier' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  tier!: string;

  @ApiProperty({ example: 'Valrhona Dark Chocolate' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  flavour!: string;

  @ApiProperty({ example: '24 to 30' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  servings!: string;

  @ApiProperty({ format: 'date-time' })
  @IsString()
  pickupAt!: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  pipingMessage?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export class StockAdjustmentDto {
  @ApiProperty({ example: -3 })
  @Type(() => Number)
  @IsNumber()
  quantity!: number;

  @ApiProperty({ example: 'Delivery from Susu-oat Nusantara' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;

  @ApiProperty({ description: 'Manager PIN required for stock adjustments' })
  @IsString()
  @MinLength(4)
  managerPin!: string;
}

export class RecountDto {
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}

// ── Customers, loyalty, subscriptions ─────────────────────────────────────────

export class SubscribeDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  customerId!: string;

  @ApiProperty({ example: 'plan-daily-brew' })
  @IsString()
  planId!: string;
}

export class SubscriptionStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'PAUSED', 'CANCELLED'] })
  @IsIn(['ACTIVE', 'PAUSED', 'CANCELLED'])
  status!: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
}

export class OccasionReminderDto {
  @ApiProperty()
  @Type(() => Boolean)
  @IsBoolean()
  reminders!: boolean;
}

// ── Platform ──────────────────────────────────────────────────────────────────

export class WebhookDto {
  @ApiProperty({ example: 'Merchant analytics sink' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'https://hooks.example.com/kedai' })
  @IsString()
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  secret!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];
}

export class WebhookToggleDto {
  @ApiProperty()
  @Type(() => Boolean)
  @IsBoolean()
  active!: boolean;
}

export class WebhookVerifyDto {
  @ApiProperty()
  @IsString()
  payload!: string;

  @ApiProperty()
  @IsString()
  secret!: string;
}

export class NotificationTestDto {
  @ApiProperty({ example: '+6281234567890' })
  @IsString()
  @MinLength(4)
  recipient!: string;

  @ApiPropertyOptional({ enum: ['WHATSAPP', 'EMAIL'] })
  @IsOptional()
  @IsIn(['WHATSAPP', 'EMAIL'])
  channel?: 'WHATSAPP' | 'EMAIL';
}

export class TemplateToggleDto {
  @ApiProperty()
  @Type(() => Boolean)
  @IsBoolean()
  active!: boolean;
}

export class CommerceSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  taxIncluded?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  taxRate?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 336 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(336)
  cakeLeadTimeHours?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 240 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  pickupHoldMinutes?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumCafeOrder?: number;
}

export class PosSettingsDto {
  @ApiPropertyOptional({ enum: [58, 80] })
  @IsOptional()
  @Type(() => Number)
  @IsIn([58, 80])
  receiptWidthMm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  printerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  offlineMode?: boolean;
}

export class OrganizationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalName?: string;

  @ApiPropertyOptional({ example: 'en-ID' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  locale?: string;

  @ApiPropertyOptional({ enum: ['IDR'] })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Asia/Jakarta' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class IntegrationsSettingsDto {
  @ApiPropertyOptional({ enum: ['sandbox', 'disabled'] })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  payments?: string;

  @ApiPropertyOptional({ enum: ['sandbox', 'disabled'] })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  whatsapp?: string;

  @ApiPropertyOptional({ enum: ['sandbox', 'disabled'] })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  email?: string;

  @ApiPropertyOptional({ enum: ['object-storage', 'disabled'] })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  storage?: string;
}

export class RealtimeSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  resyncOnReconnect?: boolean;
}

/** Sections are validated recursively, so a typo is a 400 rather than a silent no-op. */
class SettingsSections {
  @ApiPropertyOptional({ type: OrganizationSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationSettingsDto)
  organization?: OrganizationSettingsDto;

  @ApiPropertyOptional({ type: CommerceSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CommerceSettingsDto)
  commerce?: CommerceSettingsDto;

  @ApiPropertyOptional({ type: IntegrationsSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => IntegrationsSettingsDto)
  integrations?: IntegrationsSettingsDto;

  @ApiPropertyOptional({ type: RealtimeSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RealtimeSettingsDto)
  realtime?: RealtimeSettingsDto;

  @ApiPropertyOptional({ type: PosSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PosSettingsDto)
  pos?: PosSettingsDto;
}

export class SettingsPatchDto {
  @ApiProperty({
    description:
      'Partial settings grouped by section. Unknown sections and keys are rejected.',
    example: {
      commerce: { pickupHoldMinutes: 20 },
      pos: { offlineMode: true },
    },
  })
  @ValidateNested()
  @Type(() => SettingsSections)
  @IsObject()
  patch!: SettingsSections;
}

export class CustomPosItemDto {
  @ApiProperty({ example: 'Extra espresso shot' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  price?: number;
}

export class PosDiscountPreviewDto {
  @ApiProperty({ example: 'KEDAI10' })
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  code!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;
}
