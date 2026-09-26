import type {
  CartStatus,
  CheckoutStatus,
  IdempotencyStatus,
  OrderStatus,
} from "@finalshop/domain";

export type { CartStatus, CheckoutStatus, IdempotencyStatus, OrderStatus };

/**
 * Cart/checkout/order ports (W4). Money travels as BigInt minor units; the
 * quote snapshot stored on the checkout is the price lock (CART-002).
 */

export interface CartItemRecord {
  id: string;
  orgId: string;
  cartId: string;
  variantId: string;
  quantity: number;
}

export interface CartRecord {
  id: string;
  orgId: string;
  customerId: string | null;
  currency: string;
  status: CartStatus;
  items: CartItemRecord[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteLineSnapshot {
  variantId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPriceMinor: bigint;
  lineTotalMinor: bigint;
}

export interface QuoteSnapshot {
  currency: string;
  lines: QuoteLineSnapshot[];
  subtotalMinor: bigint;
  discountMinor: bigint;
  totalMinor: bigint;
  priceListIds: string[];
  quotedAt: string;
}

export interface AddressRecord {
  name: string;
  line1: string;
  line2?: string | undefined;
  city: string;
  region?: string | undefined;
  postalCode?: string | undefined;
  country: string;
  phone?: string | undefined;
}

export interface CheckoutRecord {
  id: string;
  orgId: string;
  cartId: string;
  status: CheckoutStatus;
  currency: string;
  customerId: string | null;
  quote: QuoteSnapshot | null;
  address: AddressRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderLineRecord {
  id: string;
  orgId: string;
  orderId: string;
  variantId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPriceMinor: bigint;
  lineTotalMinor: bigint;
  lineDiscountMinor: bigint;
}

export interface OrderRecord {
  id: string;
  orgId: string;
  orderNumber: string;
  sequence: number;
  checkoutId: string;
  customerId: string | null;
  currency: string;
  status: OrderStatus;
  subtotalMinor: bigint;
  discountMinor: bigint;
  totalMinor: bigint;
  placedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdempotencyRecord {
  id: string;
  orgId: string;
  key: string;
  status: IdempotencyStatus;
  requestHash: string;
  resultSnapshot: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartRepository {
  create(input: {
    orgId: string;
    customerId?: string | undefined;
    currency: string;
    expiresAt: Date;
  }): Promise<CartRecord>;
  findById(id: string): Promise<CartRecord | null>;
  addItem(input: {
    orgId: string;
    cartId: string;
    variantId: string;
    quantity: number;
  }): Promise<CartRecord>;
  setItemQuantity(input: {
    orgId: string;
    cartId: string;
    variantId: string;
    quantity: number;
  }): Promise<CartRecord>;
  removeItem(input: {
    orgId: string;
    cartId: string;
    variantId: string;
  }): Promise<CartRecord>;
  markStatus(input: {
    id: string;
    orgId: string;
    status: CartStatus;
  }): Promise<CartRecord>;
}

export interface CheckoutRepository {
  create(input: { orgId: string; cartId: string; currency: string }): Promise<CheckoutRecord>;
  findById(id: string): Promise<CheckoutRecord | null>;
  findByCart(cartId: string): Promise<CheckoutRecord | null>;
  markStatus(input: {
    id: string;
    orgId: string;
    status: CheckoutStatus;
  }): Promise<CheckoutRecord>;
  setQuote(input: {
    id: string;
    orgId: string;
    quote: QuoteSnapshot;
  }): Promise<CheckoutRecord>;
  setCustomer(input: {
    id: string;
    orgId: string;
    customerId: string;
  }): Promise<CheckoutRecord>;
  setAddress(input: {
    id: string;
    orgId: string;
    address: AddressRecord;
  }): Promise<CheckoutRecord>;
}

export interface OrderRepository {
  /** Atomic per-org sequence; unique on (orgId, sequence). */
  nextSequence(orgId: string): Promise<number>;
  create(input: {
    orgId: string;
    sequence: number;
    checkoutId: string;
    customerId: string | null;
    currency: string;
    status: OrderStatus;
    lines: Array<{
      variantId: string;
      sku: string;
      title: string;
      quantity: number;
      unitPriceMinor: bigint;
      lineTotalMinor: bigint;
      lineDiscountMinor: bigint;
    }>;
    subtotalMinor: bigint;
    discountMinor: bigint;
    totalMinor: bigint;
  }): Promise<OrderRecord>;
  findById(id: string): Promise<OrderRecord | null>;
  findByNumber(orgId: string, orderNumber: string): Promise<OrderRecord | null>;
  listLines(orgId: string, orderId: string): Promise<OrderLineRecord[]>;
  listByStatus(orgId: string, status: OrderStatus): Promise<OrderRecord[]>;
  markStatus(input: {
    id: string;
    orgId: string;
    status: OrderStatus;
  }): Promise<OrderRecord>;
}

export interface IdempotencyRepository {
  find(orgId: string, key: string): Promise<IdempotencyRecord | null>;
  /** Creates the PENDING record; a concurrent duplicate surfaces as conflict. */
  start(input: { orgId: string; key: string; requestHash: string }): Promise<IdempotencyRecord>;
  complete(input: {
    orgId: string;
    key: string;
    resultSnapshot: Record<string, unknown>;
  }): Promise<IdempotencyRecord>;
  fail(input: { orgId: string; key: string; message: string }): Promise<IdempotencyRecord>;
}
