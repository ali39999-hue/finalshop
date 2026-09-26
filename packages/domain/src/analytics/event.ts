import { DomainError } from "../errors";

/**
 * Analytics event model (W12, roadmap §15): every event name carries an
 * explicit schema version (`product.viewed@1`) so dashboards survive
 * breaking changes. Property payloads are size-capped and screened against a
 * PII deny-list — customer data must not leak into telemetry (roadmap §15).
 */

export const MAX_EVENT_PROPERTIES = 30;
export const MAX_EVENT_PROPERTY_LENGTH = 500;

const EVENT_NAME_REGEX = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*@\d+$/;

const PII_KEY_DENYLIST = [
  "email",
  "mail",
  "phone",
  "tel",
  "mobile",
  "firstname",
  "lastname",
  "fullname",
  "fullnamear",
  "address",
  "street",
  "postalcode",
  "zipcode",
  "ssn",
  "nationalid",
  "creditcard",
  "cardnumber",
];

export function parseEventName(
  name: string,
): { base: string; version: number } {
  if (!EVENT_NAME_REGEX.test(name)) {
    throw new DomainError(
      "ANALYTICS_EVENT_INVALID",
      `event name must look like 'cart.updated@1', got ${JSON.stringify(name)}`,
    );
  }
  const atIndex = name.lastIndexOf("@");
  return {
    base: name.slice(0, atIndex),
    version: Number(name.slice(atIndex + 1)),
  };
}

function isPiiKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  return PII_KEY_DENYLIST.some((banned) => normalized.includes(banned));
}

export function assertEventPropertiesSafe(
  properties: Record<string, unknown>,
): void {
  const keys = Object.keys(properties ?? {});
  if (keys.length > MAX_EVENT_PROPERTIES) {
    throw new DomainError(
      "ANALYTICS_EVENT_INVALID",
      `at most ${MAX_EVENT_PROPERTIES} properties allowed`,
    );
  }
  for (const key of keys) {
    if (isPiiKey(key)) {
      throw new DomainError(
        "ANALYTICS_PII_BLOCKED",
        `property ${key} looks like personal data`,
      );
    }
    const value = properties[key];
    if (typeof value === "string" && value.length > MAX_EVENT_PROPERTY_LENGTH) {
      throw new DomainError(
        "ANALYTICS_EVENT_INVALID",
        `property ${key} exceeds ${MAX_EVENT_PROPERTY_LENGTH} chars`,
      );
    }
  }
}
