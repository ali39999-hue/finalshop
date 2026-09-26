import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type JournalEntry,
  type TenantContext,
  assertOrderConfirmable,
  assertPaymentIntentTransition,
  buildAuditEvent,
  paymentReceivedJournal,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { PaymentIntentRecord } from "../payment-finance-ports";
import type { Repositories } from "../ports";

const PaymentInput = z.object({
  orgId: z.string().min(1),
  orderId: z.string().min(1),
  providerId: z.string().min(1).max(100).optional(),
});

/** PAY-001: creates the intent for a PENDING_PAYMENT order (one open intent). */
export async function createPaymentIntent(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof PaymentInput>,
) {
  const parsed = PaymentInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const actor = requireUserId(ctx);
  const order = await repos.orders.findById(parsed.orderId);
  if (!order || order.orgId !== parsed.orgId) {
    throw new DomainError("ORDER_NOT_FOUND", `order ${parsed.orderId} not found`);
  }
  if (order.status !== "PENDING_PAYMENT") {
    throw new DomainError(
      "PAYMENT_AMOUNT_INVALID",
      `order is ${order.status}, not awaiting payment`,
    );
  }
  const existing = await repos.paymentIntents.listByOrder(parsed.orgId, order.id);
  if (existing.some((i) => ["CREATED", "PROCESSING"].includes(i.status))) {
    throw new DomainError(
      "PAYMENT_INTENT_CONFLICT",
      "an open payment intent already exists for this order",
    );
  }
  const intent = await repos.paymentIntents.create({
    orgId: parsed.orgId,
    orderId: order.id,
    currency: order.currency,
    amountMinor: order.totalMinor,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "payment.intent_created",
      subjectType: AUDIT_SUBJECTS.PAYMENT_INTENT,
      subjectId: intent.id,
      after: { orderId: order.id, amountMinor: intent.amountMinor.toString() },
    }),
  );
  return intent;
}

export async function loadIntent(repos: Repositories, orgId: string, intentId: string) {
  const intent = await repos.paymentIntents.findById(intentId);
  if (!intent || intent.orgId !== orgId) {
    throw new DomainError("PAYMENT_INTENT_NOT_FOUND", `intent ${intentId} not found`);
  }
  return intent;
}

/** FIN-001: post the canonical capture journal exactly once per intent. */
async function postCaptureJournal(
  repos: Repositories,
  orgId: string,
  intent: PaymentIntentRecord,
): Promise<JournalEntry | null> {
  if (await repos.journals.existsForSource(orgId, "payment.intent", intent.id)) {
    return null; // webhook replay racing a manual confirm — already posted
  }
  const journal = paymentReceivedJournal({
    currency: intent.currency,
    totalMinor: intent.amountMinor,
    taxMinor: 0n,
    sourceId: intent.id,
    effectiveAt: new Date(),
  });
  await repos.journals.create({ orgId, ...journal });
  return journal;
}

/**
 * Shared capture chain used by the manual confirm AND the webhook inbox:
 * intent SUCCEEDED → order CONFIRMED → checkout ORDER_CONFIRMED → journal.
 */
export async function applyCapture(
  repos: Repositories,
  orgId: string,
  intentId: string,
  providerRef: string | null,
  actorId: string,
) {
  const intent = await loadIntent(repos, orgId, intentId);
  assertPaymentIntentTransition(intent.status, "SUCCEEDED");
  const updated = await repos.paymentIntents.markStatus({
    id: intent.id,
    orgId,
    status: "SUCCEEDED",
    ...(providerRef !== null && { providerRef }),
  });
  await repos.paymentAttempts.create({
    orgId,
    intentId: intent.id,
    status: "SUCCEEDED",
    ...(providerRef !== null && { providerRef }),
  });

  const order = await repos.orders.findById(intent.orderId);
  if (!order || order.orgId !== orgId) {
    throw new DomainError("ORDER_NOT_FOUND", intent.orderId);
  }
  assertOrderConfirmable(order.status);
  await repos.orders.markStatus({ id: order.id, orgId, status: "CONFIRMED" });

  const checkout = await repos.checkouts.findById(order.checkoutId);
  if (checkout && checkout.status === "PAYMENT_PENDING") {
    await repos.checkouts.markStatus({
      id: checkout.id,
      orgId,
      status: "PAYMENT_CONFIRMED",
    });
    await repos.checkouts.markStatus({
      id: checkout.id,
      orgId,
      status: "ORDER_CONFIRMED",
    });
  }

  await postCaptureJournal(repos, orgId, intent);
  await repos.audit.record(
    buildAuditEvent({
      orgId,
      actorId,
      action: "order.payment_confirmed",
      subjectType: AUDIT_SUBJECTS.ORDER,
      subjectId: order.id,
      after: { intentId: intent.id },
    }),
  );
  return { intent: updated, order };
}

/** Confirms a payment (manual path; webhooks route through ingestWebhook). */
export async function confirmPayment(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof PaymentInput> & { intentId: string; providerRef?: string },
) {
  const parsed = PaymentInput.extend({
    intentId: z.string().min(1),
    providerRef: z.string().min(1).max(200).optional(),
  }).parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "payment.update");
  return applyCapture(
    repos,
    parsed.orgId,
    parsed.intentId,
    parsed.providerRef ?? null,
    requireUserId(ctx),
  );
}

/** Marks processing started by a provider attempt. */
export async function startPaymentAttempt(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof PaymentInput> & { intentId: string },
) {
  const parsed = PaymentInput.extend({ intentId: z.string().min(1) }).parse(input);
  requireSameTenant(ctx, parsed.orgId);
  const actor = requireUserId(ctx);
  const intent = await loadIntent(repos, parsed.orgId, parsed.intentId);
  assertPaymentIntentTransition(intent.status, "PROCESSING");
  const updated = await repos.paymentIntents.markStatus({
    id: intent.id,
    orgId: parsed.orgId,
    status: "PROCESSING",
    ...(parsed.providerId !== undefined && { providerId: parsed.providerId }),
  });
  await repos.paymentAttempts.create({
    orgId: parsed.orgId,
    intentId: intent.id,
    status: "PROCESSING",
    ...(parsed.providerId !== undefined && { providerId: parsed.providerId }),
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "payment.processing_started",
      subjectType: AUDIT_SUBJECTS.PAYMENT_INTENT,
      subjectId: intent.id,
    }),
  );
  return updated;
}

export async function failPayment(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof PaymentInput> & { intentId: string; reason: string },
) {
  const parsed = PaymentInput.extend({
    intentId: z.string().min(1),
    reason: z.string().min(1).max(500),
  }).parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "payment.update");
  const intent = await loadIntent(repos, parsed.orgId, parsed.intentId);
  assertPaymentIntentTransition(intent.status, "FAILED");
  const updated = await repos.paymentIntents.markStatus({
    id: intent.id,
    orgId: parsed.orgId,
    status: "FAILED",
  });
  await repos.paymentAttempts.create({
    orgId: parsed.orgId,
    intentId: intent.id,
    status: "FAILED",
    failureReason: parsed.reason,
  });
  const order = await repos.orders.findById(intent.orderId);
  if (order) {
    const checkout = await repos.checkouts.findById(order.checkoutId);
    if (checkout && checkout.status === "PAYMENT_PENDING") {
      await repos.checkouts.markStatus({
        id: checkout.id,
        orgId: parsed.orgId,
        status: "PAYMENT_FAILED",
      });
    }
  }
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: requireUserId(ctx),
      action: "order.payment_failed",
      subjectType: AUDIT_SUBJECTS.PAYMENT_INTENT,
      subjectId: intent.id,
      after: { reason: parsed.reason },
    }),
  );
  return updated;
}
