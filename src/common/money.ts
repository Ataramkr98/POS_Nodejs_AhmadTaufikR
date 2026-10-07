export type MoneyDto = { amount: string; currency: 'IDR' };

export const money = (amount: number): MoneyDto => ({
  amount: Math.round(amount).toString(),
  currency: 'IDR',
});

export const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});
