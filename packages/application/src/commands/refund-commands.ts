import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  DomainError,
  type TenantContext,
  assertRefundTransition,
  assertRefundable,
  buildAuditEvent,
  refundExecutedJournal,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

const RefundInput = z.object({
  orgId: z.string().min(1),
  intentId: z.string().min(1),
  amountMinor: z.string().regex(/^\d+$/),
  reason: z.string().min(1).max(500),
});

/** PAY-003: opens a refund request within the captured-amount trace. */
export async function requestRefund(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof RefundInput>,
) {
  const parsed = RefundInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "payment.update");
  const actor = requireUserId(ctx);
  const intent = await repos.paymentIntents.findById(parsed.intentId);
  if (!intent || intent.orgId !== parsed.orgId) {
    throw new DomainError("PAYMENT_INTENT_NOT_FOUND", `intent ${parsed.intentId} not found`);
  }
  if (intent.status !== "SUCCEEDED") {
    throw new DomainError("REFUND_INVALID", "only captured payments can be refunded");
  }
  const refunded = await repos.refunds.sumExecutedMinor(parsed.orgId, intent.id);
  assertRefundable({
    capturedMinor: intent.amountMinor,
    refundedMinor: refunded,
    requestedMinor: BigInt(parsed.amountMinor),
  });
  const refund = await repos.refunds.create({
    orgId: parsed.orgId,
    intentId: intent.id,
    currency: intent.currency,
    amountMinor: BigInt(parsed.amountMinor),
    reason: parsed.reason,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "payment.refund_requested",
      subjectType: AUDIT_SUBJECTS.REFUND,
      subjectId: refund.id,
      after: { amountMinor: parsed.amountMinor, reason: parsed.reason },
    }),
  );
  return refund;
}

const SettleRefundInput = z.object({
  orgId: z.string().min(1),
  refundId: z.string().min(1),
  providerRef: z.string().min(1).max(200).optional(),
});

async function loadRefund(repos: Repositories, orgId: string, refundId: string) {
  const refund = await repos.refunds.findById(refundId);
  if (!refund || refund.orgId !== orgId) {
    throw new DomainError("REFUND_NOT_FOUND", `refund ${refundId} not found`);
  }
  return refund;
}

export async function approveRefund(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof SettleRefundInput>,
) {
  const parsed = SettleRefundInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "finance.post");
  const actor = requireUserId(ctx);
  const refund = await loadRefund(repos, parsed.orgId, parsed.refundId);
  assertRefundTransition(refund.status, "APPROVED");
  const approved = await repos.refunds.markStatus({
    id: refund.id,
    orgId: parsed.orgId,
    status: "APPROVED",
    ...(parsed.providerRef !== undefined && { providerRef: parsed.providerRef }),
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "payment.refund_approved",
      subjectType: AUDIT_SUBJECTS.REFUND,
      subjectId: refund.id,
      before: { status: refund.status },
      after: { status: "APPROVED" },
    }),
  );
  return approved;
}

/** EXECUTED posts the reversal journal (FIN-001) in the same command. */
export async function executeRefund(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof SettleRefundInput> & { providerRef: string },
) {
  const parsed = SettleRefundInput.extend({ providerRef: z.string().min(1).max(200) }).parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "finance.post");
  const actor = requireUserId(ctx);
  const refund = await loadRefund(repos, parsed.orgId, parsed.refundId);
  assertRefundTransition(refund.status, "EXECUTED");

  const executed = await repos.refunds.markStatus({
    id: refund.id,
    orgId: parsed.orgId,
    status: "EXECUTED",
    providerRef: parsed.providerRef,
  });
  const journal = refundExecutedJournal({
    currency: refund.currency,
    refundMinor: refund.amountMinor,
    sourceId: refund.id,
    effectiveAt: new Date(),
  });
  if (!(await repos.journals.existsForSource(parsed.orgId, "payment.refund", refund.id))) {
    await repos.journals.create({ orgId: parsed.orgId, ...journal });
  }
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "payment.refund_executed",
      subjectType: AUDIT_SUBJECTS.REFUND,
      subjectId: refund.id,
      after: { amountMinor: refund.amountMinor.toString(), providerRef: parsed.providerRef },
    }),
  );
  return executed;
}
