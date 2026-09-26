import type {
  FulfillmentKind,
  FulfillmentStatus,
  ReturnStatus,
  ShippingRateKind,
} from "@finalshop/domain";

export type {
  FulfillmentKind,
  FulfillmentStatus,
  ReturnStatus,
  ShippingRateKind,
};

/**
 * Fulfillment & returns ports (W6). Money appears only on shipping rates;
 * the refund linkage rides on RefundRecord (PAY-003).
 */

export interface FulfillmentLineRecord {
  id: string;
  orgId: string;
  fulfillmentId: string;
  orderLineId: string;
  variantId: string;
  quantity: number;
}

export interface TrackingEventRecord {
  id: string;
  orgId: string;
  fulfillmentId: string;
  occurredAt: Date;
  description: string;
  location: string | null;
}

export interface FulfillmentRecord {
  id: string;
  orgId: string;
  orderId: string;
  kind: FulfillmentKind;
  status: FulfillmentStatus;
  trackingNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: FulfillmentLineRecord[];
}

export interface ReturnLineRecord {
  id: string;
  orgId: string;
  returnId: string;
  orderLineId: string;
  variantId: string;
  quantity: number;
}

export interface ReturnRecord {
  id: string;
  orgId: string;
  orderId: string;
  status: ReturnStatus;
  reason: string;
  refundId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: ReturnLineRecord[];
}

export interface ShippingRateRecord {
  id: string;
  orgId: string;
  name: string;
  kind: ShippingRateKind;
  currency: string;
  amountMinor: bigint;
  maxWeightGrams: number | null;
  country: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface FulfillmentRepository {
  create(input: {
    orgId: string;
    orderId: string;
    kind: FulfillmentKind;
    lines: Array<{ orderLineId: string; variantId: string; quantity: number }>;
  }): Promise<FulfillmentRecord>;
  findById(id: string): Promise<FulfillmentRecord | null>;
  listByOrder(orgId: string, orderId: string): Promise<FulfillmentRecord[]>;
  markStatus(input: {
    id: string;
    orgId: string;
    status: FulfillmentStatus;
    trackingNumber?: string;
  }): Promise<FulfillmentRecord>;
  addTrackingEvent(input: {
    orgId: string;
    fulfillmentId: string;
    occurredAt: Date;
    description: string;
    location?: string;
  }): Promise<TrackingEventRecord>;
  listTracking(orgId: string, fulfillmentId: string): Promise<TrackingEventRecord[]>;
}

export interface ReturnRepository {
  create(input: {
    orgId: string;
    orderId: string;
    reason: string;
    lines: Array<{ orderLineId: string; variantId: string; quantity: number }>;
  }): Promise<ReturnRecord>;
  findById(id: string): Promise<ReturnRecord | null>;
  listByOrder(orgId: string, orderId: string): Promise<ReturnRecord[]>;
  markStatus(input: {
    id: string;
    orgId: string;
    status: ReturnStatus;
    refundId?: string;
  }): Promise<ReturnRecord>;
  listByStatus(orgId: string, status: ReturnStatus): Promise<ReturnRecord[]>;
}

export interface ShippingRateRepository {
  create(input: {
    orgId: string;
    name: string;
    kind: ShippingRateKind;
    currency: string;
    amountMinor: bigint;
    maxWeightGrams?: number;
    country?: string;
  }): Promise<ShippingRateRecord>;
  setActive(input: { id: string; orgId: string; isActive: boolean }): Promise<ShippingRateRecord>;
  listActive(orgId: string, currency: string): Promise<ShippingRateRecord[]>;
  listByOrg(orgId: string): Promise<ShippingRateRecord[]>;
}
