import type { BaseDocument } from './base.schema.js';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';

export interface SubscriptionDocument extends BaseDocument {
  teamId: string;
  planName: string;
  status: SubscriptionStatus;
  billingProvider: string | null;
  providerSubscriptionId: string | null;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
}

export const SUBSCRIPTIONS_COLLECTION = 'subscriptions';
