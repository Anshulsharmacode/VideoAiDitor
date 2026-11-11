export type CreditTransactionReason = 'plan_grant' | 'purchase' | 'usage' | 'refund' | 'expiry';

export interface CreditTransactionDocument {
  _id: string;
  teamId: string;
  projectId: string | null;
  amount: number;
  reason: CreditTransactionReason;
  idempotencyKey: string;
  createdAt: Date;
}

export const CREDIT_TRANSACTIONS_COLLECTION = 'credit_transactions';
