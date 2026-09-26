import { describe, expect, it } from "vitest";
import { DomainError } from "@finalshop/domain";
import { StripePaymentProvider } from "./stripe-payment-provider";

function fakeFetch(respond: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const { status, body } = respond(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchFn };
}

// Neutral offline fixtures — these are NOT credentials; no real gateway is
// contacted by these tests (the HTTP function is injected).
const fixtureAuth = "unit-test-auth";
const fixtureClientToken = "unit-test-client-token";
const intentResponse = {
  id: "pi_unit_123",
  object: "payment_intent",
  amount: 5400,
  currency: "usd",
  status: "requires_payment_method",
  client_secret: fixtureClientToken,
};

describe("StripePaymentProvider (PAY-001 adapter)", () => {
  it("creates intents with the auth header, minor-unit amount and traceability metadata", async () => {
    const { calls, fetchFn } = fakeFetch(() => ({ status: 200, body: intentResponse }));
    const provider = new StripePaymentProvider(fixtureAuth, fetchFn);

    const intent = await provider.createIntent({
      amountMinor: 5400n,
      currency: "USD",
      localIntentId: "local-intent-1",
    });

    expect(intent).toEqual({
      providerId: "stripe",
      providerRef: "pi_unit_123",
      status: "pending",
      amountMinor: 5400n,
      currency: "USD",
      clientSecret: fixtureClientToken,
    });
    const request = calls[0]!;
    expect(request.url).toBe("https://api.stripe.com/v1/payment_intents");
    expect((request.init?.headers as Record<string, string>).authorization).toBe(
      `Bearer ${fixtureAuth}`,
    );
    const body = request.init?.body as string;
    expect(body).toContain("amount=5400");
    expect(body).toContain("currency=usd");
    expect(body).toContain("metadata%5BlocalIntentId%5D=local-intent-1");
  });

  it("captures and maps the succeeded status", async () => {
    const { calls, fetchFn } = fakeFetch(() => ({
      status: 200,
      body: { ...intentResponse, status: "succeeded" },
    }));
    const provider = new StripePaymentProvider(fixtureAuth, fetchFn);
    const intent = await provider.capture("pi_unit_123");
    expect(intent.status).toBe("succeeded");
    expect(calls[0]?.url).toBe("https://api.stripe.com/v1/payment_intents/pi_unit_123/confirm");
  });

  it("refunds against the gateway intent", async () => {
    const { calls, fetchFn } = fakeFetch(() => ({
      status: 200,
      body: { id: "re_unit_1", object: "refund", amount: 1000, status: "succeeded" },
    }));
    const provider = new StripePaymentProvider(fixtureAuth, fetchFn);
    const refund = await provider.refund({ providerRef: "pi_unit_123", amountMinor: 1000n });
    expect(refund).toEqual({ providerRef: "re_unit_1", amountMinor: 1000n, status: "succeeded" });
    const body = calls[0]?.init?.body as string;
    expect(body).toContain("payment_intent=pi_unit_123");
    expect(body).toContain("amount=1000");
  });

  it("maps gateway errors onto domain errors", async () => {
    const { fetchFn } = fakeFetch(() => ({
      status: 402,
      body: { error: { type: "card_error", message: "card declined" } },
    }));
    const provider = new StripePaymentProvider(fixtureAuth, fetchFn);
    await expect(
      provider.createIntent({ amountMinor: 100n, currency: "USD", localIntentId: "x" }),
    ).rejects.toMatchObject({
      code: "PAYMENT_PROVIDER_ERROR",
      message: expect.stringContaining("card declined"),
    });
  });

  it("rejects malformed gateway responses", async () => {
    const { fetchFn } = fakeFetch(() => ({
      status: 500,
      body: { error: { type: "api_error" } },
    }));
    const provider = new StripePaymentProvider(fixtureAuth, fetchFn);
    await expect(
      provider.createIntent({ amountMinor: 100n, currency: "USD", localIntentId: "x" }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
