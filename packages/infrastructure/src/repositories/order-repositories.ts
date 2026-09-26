import {
  Prisma,
  type Cart,
  type CartItem,
  type Checkout,
  type IdempotencyRecord,
  type Order,
  type PrismaClient,
} from "@prisma/client";
import { DomainError } from "@finalshop/domain";
import type {
  CartRecord,
  CartRepository,
  CartStatus,
  CheckoutRecord,
  CheckoutRepository,
  CheckoutStatus,
  IdempotencyRecord as IdempotencyRecordType,
  IdempotencyRepository,
  IdempotencyStatus,
  OrderRecord,
  OrderRepository,
  OrderStatus,
  QuoteSnapshot,
  AddressRecord,
} from "@finalshop/application";
import { rethrowMapped } from "./prisma-repositories";

const toCart = (row: Cart, items: CartItem[]): CartRecord => ({
  id: row.id,
  orgId: row.orgId,
  customerId: row.customerId,
  currency: row.currency,
  status: row.status as CartStatus,
  items: items.map((item) => ({
    id: item.id,
    orgId: item.orgId,
    cartId: item.cartId,
    variantId: item.variantId,
    quantity: item.quantity,
  })),
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toCheckout = (row: Checkout): CheckoutRecord => ({
  id: row.id,
  orgId: row.orgId,
  cartId: row.cartId,
  status: row.status as CheckoutStatus,
  currency: row.currency,
  customerId: row.customerId,
  quote: (row.quote as unknown as QuoteSnapshot) ?? null,
  address: (row.address as unknown as AddressRecord) ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toOrder = (row: Order): OrderRecord => ({
  id: row.id,
  orgId: row.orgId,
  orderNumber: row.orderNumber,
  sequence: row.sequence,
  checkoutId: row.checkoutId,
  customerId: row.customerId,
  currency: row.currency,
  status: row.status as OrderStatus,
  subtotalMinor: row.subtotalMinor,
  discountMinor: row.discountMinor,
  totalMinor: row.totalMinor,
  placedAt: row.placedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toIdempotency = (row: IdempotencyRecord): IdempotencyRecordType => ({
  id: row.id,
  orgId: row.orgId,
  key: row.key,
  status: row.status as IdempotencyStatus,
  requestHash: row.requestHash,
  resultSnapshot: (row.resultSnapshot as Record<string, unknown>) ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const json = (value: unknown): Prisma.InputJsonValue =>
  value as unknown as Prisma.InputJsonValue;

/** Prisma implementations of the cart/checkout/order/idempotency ports (W4). */
export function createOrderRepositories(db: PrismaClient): {
  carts: CartRepository;
  checkouts: CheckoutRepository;
  orders: OrderRepository;
  idempotency: IdempotencyRepository;
} {
  const carts: CartRepository = {
    create: async (input) => {
      const row = await db.cart.create({
        data: {
          orgId: input.orgId,
          currency: input.currency,
          ...(input.customerId !== undefined && { customerId: input.customerId }),
          expiresAt: input.expiresAt,
        },
      });
      return toCart(row, []);
    },
    findById: async (id) => {
      const row = await db.cart.findUnique({
        where: { id },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      return row ? toCart(row, row.items) : null;
    },
    addItem: async (input) => {
      const updated = await db.$transaction(async (tx) => {
        await tx.cartItem.upsert({
          where: { cartId_variantId: { cartId: input.cartId, variantId: input.variantId } },
          create: {
            orgId: input.orgId,
            cartId: input.cartId,
            variantId: input.variantId,
            quantity: input.quantity,
          },
          update: { quantity: { increment: input.quantity } },
        });
        return tx.cart.findUnique({
          where: { id: input.cartId },
          include: { items: { orderBy: { createdAt: "asc" } } },
        });
      });
      if (!updated) throw new DomainError("CART_NOT_FOUND", input.cartId);
      return toCart(updated, updated.items);
    },
    setItemQuantity: async (input) => {
      await db.cartItem.update({
        where: { cartId_variantId: { cartId: input.cartId, variantId: input.variantId } },
        data: { quantity: input.quantity },
      });
      const row = await db.cart.findUnique({
        where: { id: input.cartId },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      if (!row) throw new DomainError("CART_NOT_FOUND", input.cartId);
      return toCart(row, row.items);
    },
    removeItem: async (input) => {
      await db.cartItem.delete({
        where: { cartId_variantId: { cartId: input.cartId, variantId: input.variantId } },
      });
      const row = await db.cart.findUnique({
        where: { id: input.cartId },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      if (!row) throw new DomainError("CART_NOT_FOUND", input.cartId);
      return toCart(row, row.items);
    },
    markStatus: async (input) => {
      const existing = await db.cart.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("CART_NOT_FOUND", input.id);
      const row = await db.cart.update({
        where: { id: input.id },
        data: { status: input.status },
      });
      return toCart(row, []);
    },
  };

  const checkouts: CheckoutRepository = {
    create: async (input) => {
      const row = await db.checkout.create({ data: input });
      return toCheckout(row);
    },
    findById: async (id) => {
      const row = await db.checkout.findUnique({ where: { id } });
      return row ? toCheckout(row) : null;
    },
    findByCart: async (cartId) => {
      const row = await db.checkout.findFirst({
        where: { cartId },
        orderBy: { createdAt: "desc" },
      });
      return row ? toCheckout(row) : null;
    },
    markStatus: async (input) => {
      const existing = await db.checkout.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("CHECKOUT_NOT_FOUND", input.id);
      const row = await db.checkout.update({
        where: { id: input.id },
        data: { status: input.status },
      });
      return toCheckout(row);
    },
    setQuote: async (input) => {
      const row = await db.checkout.update({
        where: { id: input.id },
        data: { quote: json(input.quote) },
      });
      return toCheckout(row);
    },
    setCustomer: async (input) => {
      const row = await db.checkout.update({
        where: { id: input.id },
        data: { customerId: input.customerId },
      });
      return toCheckout(row);
    },
    setAddress: async (input) => {
      const row = await db.checkout.update({
        where: { id: input.id },
        data: { address: json(input.address) },
      });
      return toCheckout(row);
    },
  };

  const orders: OrderRepository = {
    nextSequence: async (orgId) => {
      // Atomic allocate-and-advance: the aggregate-based read could hand the
      // same number to two callers before any order row existed. The counter
      // row (RLS 010) upserts in a single statement; orgId is bound, never
      // interpolated.
      const rows = await db.$queryRaw<Array<{ allocated: bigint | number }>>`
        INSERT INTO "OrderSequence" ("orgId", "nextValue")
        VALUES (${orgId}, 2)
        ON CONFLICT ("orgId")
        DO UPDATE SET "nextValue" = "OrderSequence"."nextValue" + 1
        RETURNING "nextValue" - 1 AS "allocated"`;
      return Number(rows[0]?.allocated ?? 0);
    },
    create: async (input) => {
      const result = await db.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orgId: input.orgId,
            sequence: input.sequence,
            orderNumber: `SO-${String(input.sequence).padStart(8, "0")}`,
            checkoutId: input.checkoutId,
            customerId: input.customerId,
            currency: input.currency,
            status: input.status,
            subtotalMinor: input.subtotalMinor,
            discountMinor: input.discountMinor,
            totalMinor: input.totalMinor,
          },
        });
        for (const line of input.lines) {
          await tx.orderLine.create({
            data: { orgId: input.orgId, orderId: order.id, ...line },
          });
        }
        return order;
      });
      return toOrder(result);
    },
    findById: async (id) => {
      const row = await db.order.findUnique({ where: { id } });
      return row ? toOrder(row) : null;
    },
    findByNumber: async (orgId, orderNumber) => {
      const row = await db.order.findUnique({
        where: { orgId_orderNumber: { orgId, orderNumber } },
      });
      return row ? toOrder(row) : null;
    },
    listLines: async (orgId, orderId) => {
      const rows = await db.orderLine.findMany({
        where: { orgId, orderId },
        orderBy: { id: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        orderId: row.orderId,
        variantId: row.variantId,
        sku: row.sku,
        title: row.title,
        quantity: row.quantity,
        unitPriceMinor: row.unitPriceMinor,
        lineTotalMinor: row.lineTotalMinor,
        lineDiscountMinor: row.lineDiscountMinor,
      }));
    },
    listByStatus: async (orgId, status) => {
      const rows = await db.order.findMany({
        where: { orgId, status },
        orderBy: { placedAt: "asc" },
      });
      return rows.map(toOrder);
    },
    markStatus: async (input) => {
      const existing = await db.order.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("ORDER_NOT_FOUND", input.id);
      const row = await db.order.update({
        where: { id: input.id },
        data: { status: input.status },
      });
      return toOrder(row);
    },
  };

  const idempotency: IdempotencyRepository = {
    find: async (orgId, key) => {
      const row = await db.idempotencyRecord.findUnique({
        where: { orgId_key: { orgId, key } },
      });
      return row ? toIdempotency(row) : null;
    },
    start: async (input) => {
      try {
        const row = await db.idempotencyRecord.create({
          data: { orgId: input.orgId, key: input.key, requestHash: input.requestHash },
        });
        return toIdempotency(row);
      } catch (err) {
        throw rethrowMapped(
          err,
          "IdempotencyRecord_orgId_key_key",
          "IDEMPOTENCY_IN_PROGRESS",
          input.key,
        );
      }
    },
    complete: async (input) => {
      const row = await db.idempotencyRecord.update({
        where: { orgId_key: { orgId: input.orgId, key: input.key } },
        data: { status: "COMPLETED", resultSnapshot: json(input.resultSnapshot) },
      });
      return toIdempotency(row);
    },
    fail: async (input) => {
      const row = await db.idempotencyRecord.update({
        where: { orgId_key: { orgId: input.orgId, key: input.key } },
        data: { status: "FAILED" },
      });
      return toIdempotency(row);
    },
  };

  return { carts, checkouts, orders, idempotency };
}
