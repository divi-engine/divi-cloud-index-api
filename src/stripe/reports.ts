import type Stripe from 'stripe';
import {
  cloudIndexPriceIds,
  tierFromPriceId,
  TIER_MONTHLY_GBP,
  type CloudTier,
} from '../config.js';
import { getStripe } from './client.js';

export type MrrSummary = {
  currency: 'gbp';
  mrr_gbp: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  by_tier: Record<CloudTier, { count: number; mrr_gbp: number }>;
};

export type MonthlyEarnings = {
  month: string;
  currency: 'gbp';
  total_gbp: number;
  invoice_count: number;
  by_tier: Record<CloudTier, { count: number; amount_gbp: number }>;
};

function emptyTierMap(): Record<CloudTier, { count: number; mrr_gbp: number }> {
  return {
    starter: { count: 0, mrr_gbp: 0 },
    growth: { count: 0, mrr_gbp: 0 },
    scale: { count: 0, mrr_gbp: 0 },
  };
}

function emptyEarningsTierMap(): Record<CloudTier, { count: number; amount_gbp: number }> {
  return {
    starter: { count: 0, amount_gbp: 0 },
    growth: { count: 0, amount_gbp: 0 },
    scale: { count: 0, amount_gbp: 0 },
  };
}

function cloudPriceFromSubscription(sub: Stripe.Subscription): string | null {
  const item = sub.items.data[0];
  const priceId = item?.price?.id;
  if (!priceId || !cloudIndexPriceIds().has(priceId)) {
    return null;
  }
  return priceId;
}

export async function getMrrSummary(): Promise<MrrSummary> {
  const stripe = getStripe();
  const byTier = emptyTierMap();
  let mrrGbp = 0;
  let activeCount = 0;
  let trialingCount = 0;

  for (const status of ['active', 'trialing'] as const) {
    let startingAfter: string | undefined;
    for (;;) {
      const page = await stripe.subscriptions.list({
        status,
        limit: 100,
        starting_after: startingAfter,
      });

      for (const sub of page.data) {
        const priceId = cloudPriceFromSubscription(sub);
        if (!priceId) {
          continue;
        }
        const tier = tierFromPriceId(priceId);
        const monthly = TIER_MONTHLY_GBP[tier];
        mrrGbp += monthly;
        byTier[tier].count += 1;
        byTier[tier].mrr_gbp += monthly;
        if (status === 'active') {
          activeCount += 1;
        } else {
          trialingCount += 1;
        }
      }

      if (!page.has_more || page.data.length === 0) {
        break;
      }
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  return {
    currency: 'gbp',
    mrr_gbp: mrrGbp,
    active_subscriptions: activeCount,
    trialing_subscriptions: trialingCount,
    by_tier: byTier,
  };
}

function parseMonth(month: string): { start: number; end: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error('Invalid month; use YYYY-MM');
  }
  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) {
    throw new Error('Invalid month; use YYYY-MM');
  }
  const start = Math.floor(Date.UTC(year, mon - 1, 1) / 1000);
  const end = Math.floor(Date.UTC(year, mon, 1) / 1000);
  return { start, end };
}

function tierFromInvoiceLine(line: Stripe.InvoiceLineItem): CloudTier | null {
  const priceId = line.price?.id ?? line.plan?.id;
  if (!priceId || !cloudIndexPriceIds().has(priceId)) {
    return null;
  }
  return tierFromPriceId(priceId);
}

export async function getMonthlyEarnings(month: string): Promise<MonthlyEarnings> {
  const stripe = getStripe();
  const { start, end } = parseMonth(month);
  const byTier = emptyEarningsTierMap();
  let totalGbp = 0;
  let invoiceCount = 0;

  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripe.invoices.list({
      status: 'paid',
      created: { gte: start, lt: end },
      limit: 100,
      starting_after: startingAfter,
    });

    for (const invoice of page.data) {
      let invoiceMatched = false;
      for (const line of invoice.lines.data) {
        const tier = tierFromInvoiceLine(line);
        if (!tier) {
          continue;
        }
        const amountGbp = (line.amount ?? 0) / 100;
        byTier[tier].count += 1;
        byTier[tier].amount_gbp += amountGbp;
        totalGbp += amountGbp;
        invoiceMatched = true;
      }
      if (invoiceMatched) {
        invoiceCount += 1;
      }
    }

    if (!page.has_more || page.data.length === 0) {
      break;
    }
    startingAfter = page.data[page.data.length - 1].id;
  }

  for (const tier of Object.keys(byTier) as CloudTier[]) {
    byTier[tier].amount_gbp = Math.round(byTier[tier].amount_gbp * 100) / 100;
  }

  return {
    month,
    currency: 'gbp',
    total_gbp: Math.round(totalGbp * 100) / 100,
    invoice_count: invoiceCount,
    by_tier: byTier,
  };
}
