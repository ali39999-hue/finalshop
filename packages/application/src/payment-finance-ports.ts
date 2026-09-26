import type {
  PaymentIntentStatus,
  PaymentAttemptStatus,
  RefundStatus,
  WebhookEventStatus,
  WebhookEventType,
  AccountKind,
} from "@finalshop/domain";

export type {
  PaymentIntentStatus,
  PaymentAttemptStatus,
  RefundStatus,
  WebhookEventStatus,
  WebhookEventType,
  AccountKind,
};

/**
 * Payment & finance ports (W5). Amounts are BigInt minor units; providers
 * appear only as references (providerId / providerRef).
 */

export interface PaymentIntentRecord {
  id: string;
  orgId: string;
  orderId: string;
  currency: string;
  amountMinor: bigint;
  status: PaymentIntentStatus;
  providerId: string | null;
  providerRef: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentAttemptRecord {
  id: string;
  orgId: string;
  intentId: string;
  status: PaymentAttemptStatus;
  providerId: string | null;
  providerRef: string | null;
  failureReason: string | null;
  createdAt: Date;
}

export interface RefundRecord {
  id: string;
  orgId: string;
  intentId: string;
  currency: string;
  amountMinor: bigint;
  status: RefundStatus;
  reason: string;
  providerRef: string | null;
  createdAt: Date;
  settledAt: Date | null;
}

export interface WebhookEventRecord {
  id: string;
  orgId: string;
  provider: string;
  eventId: string;
  type: WebhookEventType;
  payload: Record<string, unknown>;
  status: WebhookEventStatus;
  receivedAt: Date;
  processedAt: Date | null;
}

export interface JournalLineRecord {
  id: string;
  orgId: string;
  journalId: string;
  accountCode: string;
  accountKind: AccountKind;
  debitMinor: bigint;
  creditMinor: bigint;
}

export interface JournalRecord {
  id: string;
  orgId: string;
  currency: string;
  effectiveAt: Date;
  memo: string;
  sourceType: string;
  sourceId: string;
  lines: JournalLineRecord[];
}

export interface SettlementRecord {
  id: string;
  orgId: string;
  provider: string;
  currency: string;
  grossMinor: bigint;
  feeMinor: bigint;
  netMinor: bigint;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
}

export interface TaxRateRecord {
  id: string;
  orgId: string;
  name: string;
  percentageBps: number;
  jurisdiction: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
}

export interface PaymentIntentRepository {
  create(input: {
    orgId: string;
    orderId: string;
    currency: string;
    amountMinor: bigint;
  }): Promise<PaymentIntentRecord>;
  findById(id: string): Promise<PaymentIntentRecord | null>;
  markStatus(input: {
    id: string;
    orgId: string;
    status: PaymentIntentStatus;
    providerId?: string;
    providerRef?: string;
  }): Promise<PaymentIntentRecord>;
  listByOrder(orgId: string, orderId: string): Promise<PaymentIntentRecord[]>;
}

export interface PaymentAttemptRepository {
  create(input: {
    orgId: string;
    intentId: string;
    status: PaymentAttemptStatus;
    providerId?: string;
    providerRef?: string;
    failureReason?: string;
  }): Promise<PaymentAttemptRecord>;
}

export interface RefundRepository {
  create(input: {
    orgId: string;
    intentId: string;
    currency: string;
    amountMinor: bigint;
    reason: string;
  }): Promise<RefundRecord>;
  findById(id: string): Promise<RefundRecord | null>;
  markStatus(input: {
    id: string;
    orgId: string;
    status: RefundStatus;
    providerRef?: string;
  }): Promise<RefundRecord>;
  listByIntent(orgId: string, intentId: string): Promise<RefundRecord[]>;
  listPending(orgId: string): Promise<RefundRecord[]>;
  /** Sum of EXECUTED refunds — the money trace anchor (PAY-003). */
  sumExecutedMinor(orgId: string, intentId: string): Promise<bigint>;
}

export interface WebhookEventRepository {
  find(orgId: string, provider: string, eventId: string): Promise<WebhookEventRecord | null>;
  create(input: {
    orgId: string;
    provider: string;
    eventId: string;
    type: WebhookEventType;
    payload: Record<string, unknown>;
  }): Promise<WebhookEventRecord>;
  markStatus(input: {
    id: string;
    orgId: string;
    status: WebhookEventStatus;
  }): Promise<WebhookEventRecord>;
}

export interface JournalRepository {
  create(input: {
    orgId: string;
    currency: string;
    effectiveAt: Date;
    memo: string;
    sourceType: string;
    sourceId: string;
    lines: Array<{
      accountCode: string;
      accountKind: AccountKind;
      debitMinor: bigint;
      creditMinor: bigint;
    }>;
  }): Promise<JournalRecord>;
  listByPeriod(orgId: string, from: Date, to: Date): Promise<JournalRecord[]>;
  existsForSource(orgId: string, sourceType: string, sourceId: string): Promise<boolean>;
}

export interface SettlementRepository {
  create(input: {
    orgId: string;
    provider: string;
    currency: string;
    grossMinor: bigint;
    feeMinor: bigint;
    netMinor: bigint;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<SettlementRecord>;
  findById(id: string): Promise<SettlementRecord | null>;
}

export interface TaxRateRepository {
  create(input: {
    orgId: string;
    name: string;
    percentageBps: number;
    jurisdiction: string;
    effectiveFrom: Date;
    effectiveTo?: Date;
  }): Promise<TaxRateRecord>;
  listByOrg(orgId: string): Promise<TaxRateRecord[]>;
}
