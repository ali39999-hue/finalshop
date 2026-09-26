import {
  type Fulfillment,
  type FulfillmentLine,
  type PrismaClient,
  type TrackingEvent,
} from "@prisma/client";
import { DomainError } from "@finalshop/domain";
import type {
  FulfillmentKind,
  FulfillmentRecord,
  FulfillmentRepository,
  FulfillmentStatus,
  ReturnRepository,
  ReturnStatus,
  ShippingRateKind,
  ShippingRateRecord,
  ShippingRateRepository,
  TrackingEventRecord,
} from "@finalshop/application";

const toFulfillment = (row: Fulfillment, lines: FulfillmentLine[]): FulfillmentRecord => ({
  id: row.id,
  orgId: row.orgId,
  orderId: row.orderId,
  kind: row.kind as FulfillmentKind,
  status: row.status as FulfillmentStatus,
  trackingNumber: row.trackingNumber,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  lines: lines.map((line) => ({
    id: line.id,
    orgId: line.orgId,
    fulfillmentId: line.fulfillmentId,
    orderLineId: line.orderLineId,
    variantId: line.variantId,
    quantity: line.quantity,
  })),
});

const toShippingRate = (row: {
  id: string;
  orgId: string;
  name: string;
  kind: string;
  currency: string;
  amountMinor: bigint;
  maxWeightGrams: number | null;
  country: string | null;
  isActive: boolean;
  createdAt: Date;
}): ShippingRateRecord => ({
  ...row,
  kind: row.kind as ShippingRateKind,
});

/** Prisma implementations of the fulfillment/return/shipping ports (W6). */
export function createFulfillmentRepositories(db: PrismaClient): {
  fulfillments: FulfillmentRepository;
  returns: ReturnRepository;
  shippingRates: ShippingRateRepository;
} {
  const fulfillments: FulfillmentRepository = {
    create: async (input) => {
      const result = await db.$transaction(async (tx) => {
        const fulfillment = await tx.fulfillment.create({
          data: {
            orgId: input.orgId,
            orderId: input.orderId,
            kind: input.kind,
          },
        });
        const lines: FulfillmentLine[] = [];
        for (const line of input.lines) {
          lines.push(
            await tx.fulfillmentLine.create({
              data: { orgId: input.orgId, fulfillmentId: fulfillment.id, ...line },
            }),
          );
        }
        return { fulfillment, lines };
      });
      return toFulfillment(result.fulfillment, result.lines);
    },
    findById: async (id) => {
      const row = await db.fulfillment.findUnique({
        where: { id },
        include: { lines: true },
      });
      return row ? toFulfillment(row, row.lines) : null;
    },
    listByOrder: async (orgId, orderId) => {
      const rows = await db.fulfillment.findMany({
        where: { orgId, orderId },
        include: { lines: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => toFulfillment(row, row.lines));
    },
    markStatus: async (input) => {
      const existing = await db.fulfillment.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("FULFILLMENT_NOT_FOUND", input.id);
      const row = await db.fulfillment.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.trackingNumber !== undefined && {
            trackingNumber: input.trackingNumber,
          }),
        },
      });
      return toFulfillment(row, await db.fulfillmentLine.findMany({
        where: { fulfillmentId: row.id },
      }));
    },
    addTrackingEvent: async (input) => {
      const row = await db.trackingEvent.create({
        data: {
          orgId: input.orgId,
          fulfillmentId: input.fulfillmentId,
          occurredAt: input.occurredAt,
          description: input.description,
          ...(input.location !== undefined && { location: input.location }),
        },
      });
      return {
        id: row.id,
        orgId: row.orgId,
        fulfillmentId: row.fulfillmentId,
        occurredAt: row.occurredAt,
        description: row.description,
        location: row.location,
      };
    },
    listTracking: async (orgId, fulfillmentId) => {
      const rows = await db.trackingEvent.findMany({
        where: { orgId, fulfillmentId },
        orderBy: { occurredAt: "asc" },
      });
      return rows.map(
        (row: TrackingEvent): TrackingEventRecord => ({
          id: row.id,
          orgId: row.orgId,
          fulfillmentId: row.fulfillmentId,
          occurredAt: row.occurredAt,
          description: row.description,
          location: row.location,
        }),
      );
    },
  };

  const returns: ReturnRepository = {
    create: async (input) => {
      const result = await db.$transaction(async (tx) => {
        const record = await tx.return.create({
          data: {
            orgId: input.orgId,
            orderId: input.orderId,
            reason: input.reason,
          },
        });
        const lines = [];
        for (const line of input.lines) {
          lines.push(
            await tx.returnLine.create({
              data: { orgId: input.orgId, returnId: record.id, ...line },
            }),
          );
        }
        return { record, lines };
      });
      return {
        id: result.record.id,
        orgId: result.record.orgId,
        orderId: result.record.orderId,
        status: result.record.status as ReturnStatus,
        reason: result.record.reason,
        refundId: result.record.refundId,
        createdAt: result.record.createdAt,
        updatedAt: result.record.updatedAt,
        lines: result.lines.map((line) => ({
          id: line.id,
          orgId: line.orgId,
          returnId: line.returnId,
          orderLineId: line.orderLineId,
          variantId: line.variantId,
          quantity: line.quantity,
        })),
      };
    },
    findById: async (id) => {
      const row = await db.return.findUnique({
        where: { id },
        include: { lines: true },
      });
      return row
        ? {
            id: row.id,
            orgId: row.orgId,
            orderId: row.orderId,
            status: row.status as ReturnStatus,
            reason: row.reason,
            refundId: row.refundId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            lines: row.lines.map((line) => ({
              id: line.id,
              orgId: line.orgId,
              returnId: line.returnId,
              orderLineId: line.orderLineId,
              variantId: line.variantId,
              quantity: line.quantity,
            })),
          }
        : null;
    },
    listByOrder: async (orgId, orderId) => {
      const rows = await db.return.findMany({
        where: { orgId, orderId },
        include: { lines: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        orderId: row.orderId,
        status: row.status as ReturnStatus,
        reason: row.reason,
        refundId: row.refundId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lines: row.lines.map((line) => ({
          id: line.id,
          orgId: line.orgId,
          returnId: line.returnId,
          orderLineId: line.orderLineId,
          variantId: line.variantId,
          quantity: line.quantity,
        })),
      }));
    },
    markStatus: async (input) => {
      const existing = await db.return.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("RETURN_NOT_FOUND", input.id);
      const row = await db.return.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.refundId !== undefined && { refundId: input.refundId }),
        },
      });
      return {
        id: row.id,
        orgId: row.orgId,
        orderId: row.orderId,
        status: row.status as ReturnStatus,
        reason: row.reason,
        refundId: row.refundId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lines: [],
      };
    },
    listByStatus: async (orgId, status) => {
      const rows = await db.return.findMany({
        where: { orgId, status },
        include: { lines: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        orderId: row.orderId,
        status: row.status as ReturnStatus,
        reason: row.reason,
        refundId: row.refundId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lines: row.lines.map((line) => ({
          id: line.id,
          orgId: line.orgId,
          returnId: line.returnId,
          orderLineId: line.orderLineId,
          variantId: line.variantId,
          quantity: line.quantity,
        })),
      }));
    },
  };

  const shippingRates: ShippingRateRepository = {
    create: async (input) => {
      const row = await db.shippingRate.create({
        data: {
          orgId: input.orgId,
          name: input.name,
          kind: input.kind,
          currency: input.currency,
          amountMinor: input.amountMinor,
          ...(input.maxWeightGrams !== undefined && {
            maxWeightGrams: input.maxWeightGrams,
          }),
          ...(input.country !== undefined && { country: input.country }),
        },
      });
      return toShippingRate(row);
    },
    setActive: async (input) => {
      const existing = await db.shippingRate.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("SHIPPING_RATE_NOT_FOUND", input.id);
      const row = await db.shippingRate.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
      return toShippingRate(row);
    },
    listActive: async (orgId, currency) => {
      const rows = await db.shippingRate.findMany({
        where: { orgId, currency, isActive: true },
        orderBy: { amountMinor: "asc" },
      });
      return rows.map(toShippingRate);
    },
    listByOrg: async (orgId) => {
      const rows = await db.shippingRate.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toShippingRate);
    },
  };

  return { fulfillments, returns, shippingRates };
}
