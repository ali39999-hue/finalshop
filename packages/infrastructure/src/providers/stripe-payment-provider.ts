import { DomainError } from "@finalshop/domain";
import type {
  PaymentProvider,
  ProviderIntent,
  ProviderIntentStatus,
  ProviderRefund,
} from "@finalshop/application";

/**
 * Stripe adapter (PAY-001) — talks to the Stripe REST API with fetch (no
 * SDK dependency). The HTTP function is injected so unit tests run offline
 * and production gets the platform fetch with keep-alive.
 *
 * Reference mapping: Stripe's PaymentIntent is the gateway image of the
 * kernel's intent; refunds hang off the gateway intent id.
 */

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const STRIPE_API_BASE = "https://api.stripe.com/v1";

interface StripePaymentIntentResponse {
  id: string;
  object: "payment_intent";
  amount: number;
  currency: string;
  status: string;
  client_secret?: string | null;
}

interface StripeRefundResponse {
  id: string;
  object: "refund";
  amount: number;
  status: string | null;
}

interface StripeErrorResponse {
  error: { type: string; message?: string };
}

function mapIntentStatus(status: string): ProviderIntentStatus {
  switch (status) {
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
      return "pending";
    case "processing":
      return "processing";
    case "succeeded":
      return "succeeded";
    case "canceled":
      return "canceled";
    default:
      return "pending";
  }
}

function toProviderIntent(row: StripePaymentIntentResponse): ProviderIntent {
  return {
    providerId: "stripe",
    providerRef: row.id,
    status: mapIntentStatus(row.status),
    amountMinor: BigInt(row.amount),
    currency: row.currency.toUpperCase(),
    ...(row.client_secret ? { clientSecret: row.client_secret } : {}),
  };
}

function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

export class StripePaymentProvider implements PaymentProvider {
  readonly id = "stripe";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchLike = fetch,
    private readonly baseUrl: string = STRIPE_API_BASE,
  ) {}

  private async request<T>(path: string, fields?: Record<string, string>): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method: fields ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(fields ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(fields ? { body: formBody(fields) } : {}),
    });
    const body = (await response.json()) as
      | T
      | StripeErrorResponse;
    if (!response.ok || (body as StripeErrorResponse).error) {
      const errBody = body as StripeErrorResponse;
      throw new DomainError(
        "PAYMENT_PROVIDER_ERROR",
        `stripe ${errBody.error?.type ?? response.status}: ${
          errBody.error?.message ?? "request failed"
        }`,
      );
    }
    return body as T;
  }

  async createIntent(input: {
    amountMinor: bigint;
    currency: string;
    localIntentId: string;
  }): Promise<ProviderIntent> {
    const row = await this.request<StripePaymentIntentResponse>(
      "/payment_intents",
      {
        amount: input.amountMinor.toString(),
        currency: input.currency.toLowerCase(),
        "metadata[localIntentId]": input.localIntentId,
        capture_method: "automatic",
      },
    );
    return toProviderIntent(row);
  }

  async capture(providerRef: string): Promise<ProviderIntent> {
    const row = await this.request<StripePaymentIntentResponse>(
      `/payment_intents/${encodeURIComponent(providerRef)}/confirm`,
      {},
    );
    return toProviderIntent(row);
  }

  async retrieveIntent(providerRef: string): Promise<ProviderIntent> {
    const row = await this.request<StripePaymentIntentResponse>(
      `/payment_intents/${encodeURIComponent(providerRef)}`,
    );
    return toProviderIntent(row);
  }

  async refund(input: { providerRef: string; amountMinor: bigint }): Promise<ProviderRefund> {
    const row = await this.request<StripeRefundResponse>("/refunds", {
      payment_intent: input.providerRef,
      amount: input.amountMinor.toString(),
    });
    return {
      providerRef: row.id,
      amountMinor: BigInt(row.amount),
      status: row.status === "succeeded" ? "succeeded" : row.status === "pending" ? "pending" : "failed",
    };
  }
}
