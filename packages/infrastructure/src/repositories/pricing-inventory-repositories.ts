import {
  Prisma,
  type PrismaClient,
  type Price,
  type PriceList,
  type Promotion,
  type Reservation,
} from "@prisma/client";
import { DomainError } from "@finalshop/domain";
import type {
  InventoryItemRecord,
  InventoryItemRepository,
  PriceListRecord,
  PriceListRepository,
  PriceRecord,
  PriceRepository,
  PromotionKind,
  PromotionRecord,
  PromotionRepository,
  ReservationRecord,
  ReservationRepository,
  ReservationStatus,
} from "@finalshop/application";

const toPriceList = (row: PriceList): PriceListRecord => ({
  id: row.id,
  orgId: row.orgId,
  currency: row.currency,
  priority: row.priority,
  isActive: row.isActive,
  validFrom: row.validFrom,
  validTo: row.validTo,
  createdAt: row.createdAt,
});

const toPrice = (row: Price): PriceRecord => ({
  id: row.id,
  orgId: row.orgId,
  priceListId: row.priceListId,
  variantId: row.variantId,
  minQuantity: row.minQuantity,
  unitPriceMinor: row.unitPriceMinor,
  createdAt: row.createdAt,
});

const toPromotion = (row: Promotion): PromotionRecord => ({
  id: row.id,
  orgId: row.orgId,
  name: row.name,
  kind: row.kind as PromotionKind,
  percentageBps: row.percentageBps,
  amountMinor: row.amountMinor,
  currency: row.currency,
  priority: row.priority,
  exclusive: row.exclusive,
  isActive: row.isActive,
  createdAt: row.createdAt,
});

const toItem = (row: {
  id: string;
  orgId: string;
  variantId: string;
  locationId: string | null;
  onHand: number;
  reserved: number;
  updatedAt: Date;
}): InventoryItemRecord => ({ ...row });

const toReservation = (row: Reservation): ReservationRecord => ({
  id: row.id,
  orgId: row.orgId,
  itemId: row.itemId,
  quantity: row.quantity,
  status: row.status as ReservationStatus,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  releasedAt: row.releasedAt,
  committedAt: row.committedAt,
});

const ITEM_COLUMNS = Prisma.sql`
  "id", "orgId", "variantId", "locationId", "onHand", "reserved", "updatedAt"`;

/**
 * Prisma implementations of the pricing/inventory ports (W3).
 *
 * Inventory mutations are single conditional UPDATE statements: the row lock
 * re-evaluates the WHERE clause for every concurrent writer, which is what
 * makes overselling impossible without an application-level lock.
 */
export function createPricingInventoryRepositories(db: PrismaClient): {
  priceLists: PriceListRepository;
  prices: PriceRepository;
  promotions: PromotionRepository;
  inventoryItems: InventoryItemRepository;
  reservations: ReservationRepository;
} {
  const priceLists: PriceListRepository = {
    create: async (input) => {
      const row = await db.priceList.create({
        data: {
          orgId: input.orgId,
          currency: input.currency,
          priority: input.priority,
          ...(input.validFrom !== undefined && { validFrom: input.validFrom }),
          ...(input.validTo !== undefined && { validTo: input.validTo }),
        },
      });
      return toPriceList(row);
    },
    findById: async (id) => {
      const row = await db.priceList.findUnique({ where: { id } });
      return row ? toPriceList(row) : null;
    },
    setActive: async (input) => {
      const existing = await db.priceList.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) {
        throw new DomainError("PRICE_LIST_NOT_FOUND", input.id);
      }
      const row = await db.priceList.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
      return toPriceList(row);
    },
    setPriority: async (input) => {
      const existing = await db.priceList.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("PRICE_LIST_NOT_FOUND", input.id);
      const row = await db.priceList.update({
        where: { id: input.id },
        data: { priority: input.priority },
      });
      return toPriceList(row);
    },
    listByOrg: async (orgId) => {
      const rows = await db.priceList.findMany({
        where: { orgId },
        orderBy: { priority: "asc" },
      });
      return rows.map(toPriceList);
    },
    listActive: async (orgId, currency, at) => {
      const rows = await db.priceList.findMany({
        where: {
          orgId,
          currency,
          isActive: true,
          OR: [{ validFrom: null }, { validFrom: { lte: at } }],
          AND: [{ OR: [{ validTo: null }, { validTo: { gte: at } }] }],
        },
        orderBy: { priority: "asc" },
      });
      return rows.map(toPriceList);
    },
  };

  const prices: PriceRepository = {
    setPrice: async (input) => {
      const result = await db.$transaction(async (tx) => {
        const existing = await tx.price.findFirst({
          where: {
            orgId: input.orgId,
            priceListId: input.priceListId,
            variantId: input.variantId,
            minQuantity: input.minQuantity,
          },
        });
        if (existing) {
          return tx.price.update({
            where: { id: existing.id },
            data: { unitPriceMinor: input.unitPriceMinor },
          });
        }
        return tx.price.create({ data: input });
      });
      return toPrice(result);
    },
    listForVariant: async (orgId, variantId, priceListIds) => {
      if (priceListIds.length === 0) return [];
      const rows = await db.price.findMany({
        where: { orgId, variantId, priceListId: { in: priceListIds } },
      });
      return rows.map(toPrice);
    },
  };

  const promotions: PromotionRepository = {
    create: async (input) => {
      const row = await db.promotion.create({
        data: {
          orgId: input.orgId,
          name: input.name,
          kind: input.kind,
          ...(input.percentageBps !== undefined && {
            percentageBps: input.percentageBps,
          }),
          ...(input.amountMinor !== undefined && {
            amountMinor: input.amountMinor,
          }),
          ...(input.currency !== undefined && { currency: input.currency }),
          priority: input.priority,
          exclusive: input.exclusive,
        },
      });
      return toPromotion(row);
    },
    findById: async (id) => {
      const row = await db.promotion.findUnique({ where: { id } });
      return row ? toPromotion(row) : null;
    },
    setActive: async (input) => {
      const existing = await db.promotion.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) {
        throw new DomainError("PROMOTION_NOT_FOUND", input.id);
      }
      const row = await db.promotion.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
      return toPromotion(row);
    },
    listActive: async (orgId) => {
      const rows = await db.promotion.findMany({
        where: { orgId, isActive: true },
        orderBy: { priority: "asc" },
      });
      return rows.map(toPromotion);
    },
  };

  const inventoryItems: InventoryItemRepository = {
    create: async (input) => {
      const row = await db.inventoryItem.create({
        data: {
          orgId: input.orgId,
          variantId: input.variantId,
          ...(input.locationId !== undefined && { locationId: input.locationId }),
          onHand: input.onHand,
        },
      });
      return toItem(row);
    },
    findById: async (id) => {
      const row = await db.inventoryItem.findUnique({ where: { id } });
      return row ? toItem(row) : null;
    },
    findByVariant: async (orgId, variantId) => {
      const rows = await db.inventoryItem.findMany({
        where: { orgId, variantId },
        orderBy: { id: "asc" },
      });
      return rows.map(toItem);
    },
    adjustOnHand: async (input) => {
      const rows = await db.$queryRaw<
        Array<{
          id: string;
          orgId: string;
          variantId: string;
          locationId: string | null;
          onHand: number;
          reserved: number;
          updatedAt: Date;
        }>
      >`
        UPDATE "InventoryItem"
        SET "onHand" = "onHand" + ${input.delta}, "updatedAt" = now()
        WHERE "id" = ${input.id}
          AND "orgId" = ${input.orgId}
          AND "onHand" + ${input.delta} >= 0
        RETURNING ${ITEM_COLUMNS}`;
      if (rows.length === 0) {
        throw new DomainError(
          "STOCK_LEVEL_INVALID",
          `adjustment would take item ${input.id} negative`,
        );
      }
      return toItem(rows[0]!);
    },
    reserveAtomic: async (input) => {
      const result = await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            orgId: string;
            variantId: string;
            locationId: string | null;
            onHand: number;
            reserved: number;
            updatedAt: Date;
          }>
        >`
          UPDATE "InventoryItem"
          SET "reserved" = "reserved" + ${input.quantity}, "updatedAt" = now()
          WHERE "id" = ${input.itemId}
            AND "orgId" = ${input.orgId}
            AND "reserved" + ${input.quantity} <= "onHand"
          RETURNING ${ITEM_COLUMNS}`;
        if (rows.length === 0) {
          throw new DomainError(
            "INSUFFICIENT_STOCK",
            `item ${input.itemId}: requested ${input.quantity} exceeds availability`,
          );
        }
        const reservation = await tx.reservation.create({
          data: {
            orgId: input.orgId,
            itemId: input.itemId,
            quantity: input.quantity,
            status: "ACTIVE",
            expiresAt: input.expiresAt,
          },
        });
        return { item: toItem(rows[0]!), reservation: toReservation(reservation) };
      });
      return result;
    },
    takeReserved: async (itemId, orgId, quantity, mode) => {
      const rows =
        mode === "COMMIT"
          ? await db.$queryRaw<
              Array<{
                id: string;
                orgId: string;
                variantId: string;
                locationId: string | null;
                onHand: number;
                reserved: number;
                updatedAt: Date;
              }>
            >`
              UPDATE "InventoryItem"
              SET
                "onHand" = "onHand" - ${quantity},
                "reserved" = "reserved" - ${quantity},
                "updatedAt" = now()
              WHERE "id" = ${itemId}
                AND "orgId" = ${orgId}
                AND "reserved" >= ${quantity}
              RETURNING ${ITEM_COLUMNS}`
          : await db.$queryRaw<
              Array<{
                id: string;
                orgId: string;
                variantId: string;
                locationId: string | null;
                onHand: number;
                reserved: number;
                updatedAt: Date;
              }>
            >`
              UPDATE "InventoryItem"
              SET "reserved" = "reserved" - ${quantity}, "updatedAt" = now()
              WHERE "id" = ${itemId}
                AND "orgId" = ${orgId}
                AND "reserved" >= ${quantity}
              RETURNING ${ITEM_COLUMNS}`;
      if (rows.length === 0) {
        throw new DomainError(
          "RESERVATION_CONFLICT",
          `item ${itemId}: reserved < ${quantity}`,
        );
      }
      return toItem(rows[0]!);
    },
  };

  const reservations: ReservationRepository = {
    findById: async (id) => {
      const row = await db.reservation.findUnique({ where: { id } });
      return row ? toReservation(row) : null;
    },
    markStatus: async (input) => {
      const existing = await db.reservation.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) {
        throw new DomainError("RESERVATION_NOT_FOUND", input.id);
      }
      const row = await db.reservation.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.releasedAt !== undefined && { releasedAt: input.releasedAt }),
          ...(input.committedAt !== undefined && {
            committedAt: input.committedAt,
          }),
        },
      });
      return toReservation(row);
    },
    listExpired: async (orgId, at, limit = 500) => {
      const rows = await db.reservation.findMany({
        where: {
          ...(orgId ? { orgId } : {}),
          status: "ACTIVE",
          expiresAt: { lte: at },
        },
        orderBy: { expiresAt: "asc" },
        take: limit,
      });
      return rows.map(toReservation);
    },
  };

  return { priceLists, prices, promotions, inventoryItems, reservations };
}
