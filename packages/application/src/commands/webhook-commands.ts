import { z } from "zod";
import { assertPaymentIntentTransition } from "@finalshop/domain";
import type { Repositories } from "../ports";
import { applyCapture, loadIntent } from "./payment-commands";

const IngestWebhookInput = z.object({
  orgId: z.string().min(1),
  provider: z.string().min(1).max(50),
  eventId: z.string().min(1).max(200),
  type: z.enum(["payment.captured", "payment.failed", "refund.executed"]),
  payload: z.record(z.string(), z.unknown()),
});

/**
 * PAY-002: the webhook inbox. Signature verification happened at the HTTP
 * boundary (the only place the secret lives); this command owns dedupe on
 * the provider event id (unique per org) and dispatch. System-level command:
 * no tenant context — the org rides on the endpoint configuration.
 *
 * Dispatch mapping (kernel):
 * - payment.captured → applyCapture (intent SUCCEEDED + order CONFIRMED + journal)
 * - payment.failed   → intent FAILED + checkout PAYMENT_FAILED
 * - refund.executed  → recorded, refund settlement flows through refunds
 */
export async function ingestWebhook(
  repos: Repositories,
  input: z.input<typeof IngestWebhookInput>,
) {
  const parsed = IngestWebhookInput.parse(input);
  const { orgId, provider } = parsed;

  // Idempotent intake: a replayed eventId short-circuits.
  const existing = await repos.webhookEvents.find(orgId, provider, parsed.eventId);
  if (existing) {
    return { duplicate: true, eventId: parsed.eventId, status: existing.status };
  }
  const event = await repos.webhookEvents.create({
    orgId,
    provider,
    eventId: parsed.eventId,
    type: parsed.type,
    payload: parsed.payload,
  });

  const intentId =
    typeof parsed.payload.intentId === "string" ? parsed.payload.intentId : null;
  const providerRef =
    typeof parsed.payload.providerRef === "string" ? parsed.payload.providerRef : null;
  if (!intentId) {
    const ignored = await repos.webhookEvents.markStatus({
      id: event.id,
      orgId,
      status: "IGNORED",
    });
    return { duplicate: false, eventId: parsed.eventId, status: ignored.status };
  }
  const intent = await loadIntent(repos, orgId, intentId);

  if (parsed.type === "payment.captured") {
    try {
      await applyCapture(repos, orgId, intent.id, providerRef, `webhook:${provider}`);
    } catch (err) {
      await repos.webhookEvents.markStatus({ id: event.id, orgId, status: "FAILED" });
      throw err;
    }
  } else if (parsed.type === "payment.failed") {
    assertPaymentIntentTransition(intent.status, "FAILED");
    await repos.paymentIntents.markStatus({ id: intent.id, orgId, status: "FAILED" });
    await repos.paymentAttempts.create({
      orgId,
      intentId: intent.id,
      status: "FAILED",
      failureReason: `webhook ${parsed.eventId}`,
    });
    await markCheckoutPaymentFailed(repos, orgId, intent.orderId);
  }

  const processed = await repos.webhookEvents.markStatus({
    id: event.id,
    orgId,
    status: "PROCESSED",
  });
  return { duplicate: false, eventId: parsed.eventId, status: processed.status };
}

async function markCheckoutPaymentFailed(
  repos: Repositories,
  orgId: string,
  orderId: string,
) {
  const order = await repos.orders.findById(orderId);
  if (!order) return;
  const checkout = await repos.checkouts.findById(order.checkoutId);
  if (checkout && checkout.status === "PAYMENT_PENDING") {
    await repos.checkouts.markStatus({
      id: checkout.id,
      orgId,
      status: "PAYMENT_FAILED",
    });
  }
}
