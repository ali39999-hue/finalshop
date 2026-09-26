import { describe, expect, it } from "vitest";
import { DomainError } from "../errors";
import { buildAuditEvent } from "./audit-event";

describe("audit events (IAM-004)", () => {
  it("builds and freezes a complete event", () => {
    const event = buildAuditEvent({
      orgId: "org-1",
      actorId: "user-1",
      action: "store.created",
      subjectType: "store",
      subjectId: "store-1",
      after: { slug: "main" },
      requestId: "req-1",
    });
    expect(event.action).toBe("store.created");
    expect(Object.isFrozen(event)).toBe(true);
  });

  it("rejects events with missing mandatory fields", () => {
    expect(() =>
      buildAuditEvent({
        orgId: "org-1",
        actorId: "",
        action: "store.created",
        subjectType: "store",
        subjectId: "store-1",
      }),
    ).toThrow(DomainError);
    expect(() =>
      buildAuditEvent({
        orgId: "org-1",
        actorId: "user-1",
        action: "",
        subjectType: "store",
        subjectId: "store-1",
      }),
    ).toThrow(DomainError);
  });
});
