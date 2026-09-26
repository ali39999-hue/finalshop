import {
  Prisma,
  type Journal,
  type JournalLine,
  type PaymentIntent,
  type PrismaClient,
  type Refund,
} from "@prisma/client";
import { DomainError } from "@finalshop/domain";
import type {
  AccountKind,
  JournalRecord,
  JournalRepository,
  PaymentAttemptRecord,
  PaymentAttemptRepository,
  PaymentIntentRecord,
  PaymentIntentRepository,
  PaymentIntentStatus,
  RefundRecord,
  RefundRepository,
  RefundStatus,
  SettlementRepository,
  TaxRateRepository,
  WebhookEventRepository,
  WebhookEventStatus,
  WebhookEventType,
} from "@finalshop/application";
import { rethrowMapped } from "./prisma-repositories";

const toIntent = (row: PaymentIntent): PaymentIntentRecord => ({
  id: row.id,
  orgId: row.orgId,
  orderId: row.orderId,
  currency: row.currency,
  amountMinor: row.amountMinor,
  status: row.status as PaymentIntentStatus,
  providerId: row.providerId,
  providerRef: row.providerRef,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toRefund = (row: Refund): RefundRecord => ({
  id: row.id,
  orgId: row.orgId,
  intentId: row.intentId,
  currency: row.currency,
  amountMinor: row.amountMinor,
  status: row.status as RefundStatus,
  reason: row.reason,
  providerRef: row.providerRef,
  createdAt: row.createdAt,
  settledAt: row.settledAt,
});

const toJournal = (row: Journal, lines: JournalLine[]): JournalRecord => ({
  id: row.id,
  orgId: row.orgId,
  currency: row.currency,
  effectiveAt: row.effectiveAt,
  memo: row.memo,
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  lines: lines.map((line) => ({
    id: line.id,
    orgId: line.orgId,
    journalId: line.journalId,
    accountCode: line.accountCode,
    accountKind: line.accountKind as AccountKind,
    debitMinor: line.debitMinor,
    creditMinor: line.creditMinor,
  })),
});

/** Prisma implementations of the payment/finance ports (W5). */
export function createPaymentFinanceRepositories(db: PrismaClient): {
  paymentIntents: PaymentIntentRepository;
  paymentAttempts: PaymentAttemptRepository;
  refunds: RefundRepository;
  webhookEvents: WebhookEventRepository;
  journals: JournalRepository;
  settlements: SettlementRepository;
  taxRates: TaxRateRepository;
} {
  const paymentIntents: PaymentIntentRepository = {
    create: async (input) => {
      const row = await db.paymentIntent.create({ data: input });
      return toIntent(row);
    },
    findById: async (id) => {
      const row = await db.paymentIntent.findUnique({ where: { id } });
      return row ? toIntent(row) : null;
    },
    markStatus: async (input) => {
      const existing = await db.paymentIntent.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("PAYMENT_INTENT_NOT_FOUND", input.id);
      const row = await db.paymentIntent.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.providerId !== undefined && { providerId: input.providerId }),
          ...(input.providerRef !== undefined && { providerRef: input.providerRef }),
        },
      });
      return toIntent(row);
    },
    listByOrder: async (orgId, orderId) => {
      const rows = await db.paymentIntent.findMany({
        where: { orgId, orderId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toIntent);
    },
  };

  const paymentAttempts: PaymentAttemptRepository = {
    create: async (input) => {
      const row = await db.paymentAttempt.create({
        data: {
          orgId: input.orgId,
          intentId: input.intentId,
          status: input.status,
          ...(input.providerId !== undefined && { providerId: input.providerId }),
          ...(input.providerRef !== undefined && { providerRef: input.providerRef }),
          ...(input.failureReason !== undefined && {
            failureReason: input.failureReason,
          }),
        },
      });
      return {
        id: row.id,
        orgId: row.orgId,
        intentId: row.intentId,
        status: row.status as PaymentAttemptRecord["status"],
        providerId: row.providerId,
        providerRef: row.providerRef,
        failureReason: row.failureReason,
        createdAt: row.createdAt,
      };
    },
  };

  const refunds: RefundRepository = {
    create: async (input) => {
      const row = await db.refund.create({ data: input });
      return toRefund(row);
    },
    findById: async (id) => {
      const row = await db.refund.findUnique({ where: { id } });
      return row ? toRefund(row) : null;
    },
    markStatus: async (input) => {
      const existing = await db.refund.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("REFUND_NOT_FOUND", input.id);
      const row = await db.refund.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.providerRef !== undefined && { providerRef: input.providerRef }),
          ...(input.status === "EXECUTED" && { settledAt: new Date() }),
        },
      });
      return toRefund(row);
    },
    listByIntent: async (orgId, intentId) => {
      const rows = await db.refund.findMany({
        where: { orgId, intentId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toRefund);
    },
    listPending: async (orgId) => {
      const rows = await db.refund.findMany({
        where: { orgId, status: { in: ["REQUESTED", "APPROVED"] } },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toRefund);
    },
    sumExecutedMinor: async (orgId, intentId) => {
      const aggregate = await db.refund.aggregate({
        where: { orgId, intentId, status: "EXECUTED" },
        _sum: { amountMinor: true },
      });
      return aggregate._sum.amountMinor ?? 0n;
    },
  };

  const webhookEvents: WebhookEventRepository = {
    find: async (orgId, provider, eventId) => {
      const row = await db.webhookEvent.findUnique({
        where: { orgId_provider_eventId: { orgId, provider, eventId } },
      });
      return row
        ? {
            id: row.id,
            orgId: row.orgId,
            provider: row.provider,
            eventId: row.eventId,
            type: row.type as WebhookEventType,
            payload: row.payload as Record<string, unknown>,
            status: row.status as WebhookEventStatus,
            receivedAt: row.receivedAt,
            processedAt: row.processedAt,
          }
        : null;
    },
    create: async (input) => {
      try {
        const row = await db.webhookEvent.create({
          data: {
            orgId: input.orgId,
            provider: input.provider,
            eventId: input.eventId,
            type: input.type,
            payload: json(input.payload),
          },
        });
        return {
          id: row.id,
          orgId: row.orgId,
          provider: row.provider,
          eventId: row.eventId,
          type: row.type as WebhookEventType,
          payload: row.payload as Record<string, unknown>,
          status: row.status as WebhookEventStatus,
          receivedAt: row.receivedAt,
          processedAt: row.processedAt,
        };
      } catch (err) {
        throw rethrowMapped(
          err,
          "WebhookEvent_orgId_provider_eventId_key",
          "WEBHOOK_EVENT_CONFLICT",
          input.eventId,
        );
      }
    },
    markStatus: async (input) => {
      const existing = await db.webhookEvent.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("WEBHOOK_EVENT_NOT_FOUND", input.id);
      const row = await db.webhookEvent.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.status === "PROCESSED" && { processedAt: new Date() }),
        },
      });
      return {
        id: row.id,
        orgId: row.orgId,
        provider: row.provider,
        eventId: row.eventId,
        type: row.type as WebhookEventType,
        payload: row.payload as Record<string, unknown>,
        status: row.status as WebhookEventStatus,
        receivedAt: row.receivedAt,
        processedAt: row.processedAt,
      };
    },
  };

  const journals: JournalRepository = {
    create: async (input) => {
      const result = await db.$transaction(async (tx) => {
        const journal = await tx.journal.create({
          data: {
            orgId: input.orgId,
            currency: input.currency,
            effectiveAt: input.effectiveAt,
            memo: input.memo,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          },
        });
        for (const line of input.lines) {
          await tx.journalLine.create({
            data: { orgId: input.orgId, journalId: journal.id, ...line },
          });
        }
        return journal;
      });
      return toJournal(result, []);
    },
    listByPeriod: async (orgId, from, to) => {
      const rows = await db.journal.findMany({
        where: { orgId, effectiveAt: { gte: from, lte: to } },
        include: { lines: true },
        orderBy: { effectiveAt: "asc" },
      });
      return rows.map((row) => toJournal(row, row.lines));
    },
    existsForSource: async (orgId, sourceType, sourceId) => {
      const row = await db.journal.findUnique({
        where: { orgId_sourceType_sourceId: { orgId, sourceType, sourceId } },
        select: { id: true },
      });
      return row !== null;
    },
  };

  const settlements: SettlementRepository = {
    create: async (input) => {
      const row = await db.settlement.create({ data: input });
      return { id: row.id, ...input, createdAt: row.createdAt };
    },
    findById: async (id) => {
      const row = await db.settlement.findUnique({ where: { id } });
      return row
        ? {
            id: row.id,
            orgId: row.orgId,
            provider: row.provider,
            currency: row.currency,
            grossMinor: row.grossMinor,
            feeMinor: row.feeMinor,
            netMinor: row.netMinor,
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            createdAt: row.createdAt,
          }
        : null;
    },
  };

  const taxRates: TaxRateRepository = {
    create: async (input) => {
      const row = await db.taxRate.create({
        data: {
          orgId: input.orgId,
          name: input.name,
          percentageBps: input.percentageBps,
          jurisdiction: input.jurisdiction,
          ...(input.effectiveTo !== undefined && { effectiveTo: input.effectiveTo }),
          effectiveFrom: input.effectiveFrom,
        },
      });
      return { id: row.id, ...input, effectiveTo: row.effectiveTo, createdAt: row.createdAt };
    },
    listByOrg: async (orgId) => {
      const rows = await db.taxRate.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        name: row.name,
        percentageBps: row.percentageBps,
        jurisdiction: row.jurisdiction,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        createdAt: row.createdAt,
      }));
    },
  };

  return {
    paymentIntents,
    paymentAttempts,
    refunds,
    webhookEvents,
    journals,
    settlements,
    taxRates,
  };
}

const json = (value: unknown): Prisma.InputJsonValue =>
  value as unknown as Prisma.InputJsonValue;
