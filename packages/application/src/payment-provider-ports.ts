/**
 * PaymentProvider contract (PAY-001, roadmap §9). This is the seam between
 * the kernel and real gateways: the kernel never imports a provider SDK —
 * adapters implement this interface and are composed in the app wiring.
 *
 * Status vocabulary is provider-neutral; adapters map their gateway's states
 * onto it (e.g. Stripe's requires_payment_method → "pending").
 */

export type ProviderIntentStatus = "pending" | "processing" | "succeeded" | "canceled";

export interface ProviderIntent {
  providerId: string;
  /** Gateway reference (e.g. Stripe PaymentIntent id). */
  providerRef: string;
  status: ProviderIntentStatus;
  amountMinor: bigint;
  currency: string;
  /** Client-side confirmation token, when the gateway issues one. */
  clientSecret?: string;
}

export interface ProviderRefund {
  providerRef: string;
  amountMinor: bigint;
  status: "succeeded" | "pending" | "failed";
}

export interface PaymentProvider {
  /** Stable provider id ("stripe", "adyen", …). */
  readonly id: string;
  /** Opens a gateway intent for the captured amount. */
  createIntent(input: {
    amountMinor: bigint;
    currency: string;
    /** Kernel traceability: the local payment intent id. */
    localIntentId: string;
  }): Promise<ProviderIntent>;
  /** Confirms/captures the gateway intent → money moves. */
  capture(providerRef: string): Promise<ProviderIntent>;
  retrieveIntent(providerRef: string): Promise<ProviderIntent>;
  refund(input: { providerRef: string; amountMinor: bigint }): Promise<ProviderRefund>;
}
