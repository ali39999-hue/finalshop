import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPrismaClient, PrismaRepositories, runInTenantTransaction } from "../index";

/**
 * Integration test against a real PostgreSQL (docker compose up from
 * infra/docker). Skipped when DATABASE_URL is not set OR the server is
 * unreachable — see databaseReachable() below.
 *
 * Note: RLS is exercised only when the connection uses a non-owner role
 * (see prisma/rls/001-tenant-rls.sql and docs/architecture/rls-strategy.md).
 * This test runs with the owner credentials, which bypass RLS by design.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Connectivity probe: when DATABASE_URL points at a server that is not
 * currently running (e.g. docker compose down), the suite self-skips instead
 * of failing — the tests are only meaningful against a live database.
 */
async function databaseReachable(): Promise<boolean> {
  if (!hasDb) return false;
  const probe = createPrismaClient();
  try {
    await probe.$queryRaw`SELECT 1`;
    await probe.$disconnect();
    return true;
  } catch {
    await probe.$disconnect().catch(() => {});
    return false;
  }
}

const hasLiveDb = await databaseReachable();
const suite = hasLiveDb ? describe : describe.skip;

suite("prisma repositories (integration)", () => {
  // Memberships carry a real FK to User; seed the owner row first.
  async function seedUser(db: ReturnType<typeof createPrismaClient>, id: string) {
    await db.user.create({ data: { id, email: `${id}@integration.test` } });
  }

  it("persists and resolves the full tenant chain", async () => {
    const db = createPrismaClient();
    const repos = new PrismaRepositories(db);
    const slug = `acme-${randomUUID().slice(0, 8)}`;
    const host = `${slug}.example.com`;
    let orgId: string | undefined;
    try {
      await seedUser(db, "user-it-1");
      const { organization } = await repos.organizations.createWithOwner({
        name: "Acme IT",
        slug,
        ownerUserId: "user-it-1",
      });
      orgId = organization.id;
      const { store, storefront } = await repos.stores.createWithDefaultStorefront({
        orgId: organization.id,
        name: "Main",
        slug: "main",
        locale: "en",
      });
      const domain = await repos.domains.attach({
        orgId: organization.id,
        storefrontId: storefront.id,
        host,
        isPrimary: true,
      });
      await repos.domains.setVerified(organization.id, domain.id, true);
      await repos.audit.record({
        orgId: organization.id,
        actorId: "user-it-1",
        action: "store.created",
        subjectType: "store",
        subjectId: store.id,
        after: { slug: "main" },
      });

      const resolved = await repos.domains.findByHostJoined(host);
      expect(resolved?.organization.id).toBe(organization.id);
      expect(resolved?.store.id).toBe(store.id);
      expect(resolved?.domain.verified).toBe(true);

      const audit = await repos.audit.listByOrg(organization.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.after).toMatchObject({ slug: "main" });

      await runInTenantTransaction(db, organization.id, async (tx) => {
        const rows = await tx.store.findMany({
          where: { orgId: organization.id },
        });
        expect(rows).toHaveLength(1);
      });
    } finally {
      if (orgId) {
        await db.auditEvent.deleteMany({ where: { orgId } });
        await db.domain.deleteMany({ where: { orgId } });
        await db.storefront.deleteMany({ where: { orgId } });
        await db.branch.deleteMany({ where: { orgId } });
        await db.store.deleteMany({ where: { orgId } });
        await db.membership.deleteMany({ where: { orgId } });
        await db.organization.deleteMany({ where: { id: orgId } });
        await db.user.deleteMany({ where: { email: { endsWith: "@integration.test" } } });
      }
      await db.$disconnect();
    }
  });

  it("persists catalog records with revisions and assets (W2)", async () => {
    const db = createPrismaClient();
    const repos = new PrismaRepositories(db);
    const slug = `cat-${randomUUID().slice(0, 8)}`;
    let orgId: string | undefined;
    try {
      await seedUser(db, "user-it-2");
      const { organization } = await repos.organizations.createWithOwner({
        name: "Catalog IT",
        slug,
        ownerUserId: "user-it-2",
      });
      orgId = organization.id;

      const product = await repos.products.create({
        orgId,
        slug: "tee",
        title: "Tee",
        options: [{ name: "Size", values: ["S", "M"] }],
      });
      const variant = await repos.variants.create({
        orgId,
        productId: product.id,
        sku: `TEE-S-${slug}`,
        optionValues: { Size: "S" },
        weightGrams: 180,
      });
      expect(variant.weightGrams).toBe(180);

      const updated = await repos.products.updateContent({
        id: product.id,
        orgId,
        title: "Tee v2",
      });
      expect(updated.title).toBe("Tee v2");
      await repos.revisions.create({
        orgId,
        productId: product.id,
        revisionNumber: 1,
        snapshot: { title: "Tee v2" },
        authorId: "user-it-2",
      });
      expect(await repos.revisions.latestNumber(orgId, product.id)).toBe(1);

      const asset = await repos.assets.create({
        orgId,
        kind: "IMAGE",
        storageKey: `org/${orgId}/image/test/${randomUUID()}`,
        mime: "image/png",
        sizeBytes: 2048,
      });
      expect(await repos.assets.listByIds(orgId, [asset.id])).toHaveLength(1);
      expect(await repos.assets.listByIds(orgId, ["missing"])).toHaveLength(0);
    } finally {
      if (orgId) {
        await db.reservation.deleteMany({ where: { orgId } });
        await db.inventoryItem.deleteMany({ where: { orgId } });
        await db.price.deleteMany({ where: { orgId } });
        await db.priceList.deleteMany({ where: { orgId } });
        await db.promotion.deleteMany({ where: { orgId } });
        await db.productRevision.deleteMany({ where: { orgId } });
        await db.productVariant.deleteMany({ where: { orgId } });
        await db.collectionProduct.deleteMany({ where: { orgId } });
        await db.product.deleteMany({ where: { orgId } });
        await db.category.deleteMany({ where: { orgId } });
        await db.collection.deleteMany({ where: { orgId } });
        await db.asset.deleteMany({ where: { orgId } });
        await db.auditEvent.deleteMany({ where: { orgId } });
        await db.storefront.deleteMany({ where: { orgId } });
        await db.branch.deleteMany({ where: { orgId } });
        await db.store.deleteMany({ where: { orgId } });
        await db.membership.deleteMany({ where: { orgId } });
        await db.organization.deleteMany({ where: { id: orgId } });
        await db.user.deleteMany({ where: { email: { endsWith: "@integration.test" } } });
      }
      await db.$disconnect();
    }
  });

  it("reserves stock atomically under concurrency (INV-003)", async () => {
    const db = createPrismaClient();
    const repos = new PrismaRepositories(db);
    const slug = `inv-${randomUUID().slice(0, 8)}`;
    let orgId: string | undefined;
    try {
      await seedUser(db, "user-it-3");
      const { organization } = await repos.organizations.createWithOwner({
        name: "Inventory IT",
        slug,
        ownerUserId: "user-it-3",
      });
      orgId = organization.id;
      const product = await repos.products.create({
        orgId,
        slug: "last-one",
        title: "Last One",
        options: [],
      });
      const variant = await repos.variants.create({
        orgId,
        productId: product.id,
        sku: `LAST-${slug}`,
        optionValues: {},
      });
      // A single unit on the shelf: exactly one of two concurrent
      // reservations must win; the other must see INSUFFICIENT_STOCK.
      const item = await repos.inventoryItems.create({
        orgId,
        variantId: variant.id,
        onHand: 1,
      });
      const expiresAt = new Date(Date.now() + 900_000);
      const attempts = await Promise.allSettled([
        repos.inventoryItems.reserveAtomic({
          orgId,
          itemId: item.id,
          quantity: 1,
          expiresAt,
        }),
        repos.inventoryItems.reserveAtomic({
          orgId,
          itemId: item.id,
          quantity: 1,
          expiresAt,
        }),
      ]);
      const fulfilled = attempts.filter((a) => a.status === "fulfilled");
      const rejected = attempts.filter((a) => a.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      for (const rejection of rejected) {
        expect((rejection as PromiseRejectedResult).reason).toMatchObject({
          code: "INSUFFICIENT_STOCK",
        });
      }
      const after = await repos.inventoryItems.findById(item.id);
      expect(after?.reserved).toBe(1);
      expect(after ? after.onHand - after.reserved : -1).toBe(0);
    } finally {
      if (orgId) {
        await db.reservation.deleteMany({ where: { orgId } });
        await db.inventoryItem.deleteMany({ where: { orgId } });
        await db.price.deleteMany({ where: { orgId } });
        await db.priceList.deleteMany({ where: { orgId } });
        await db.promotion.deleteMany({ where: { orgId } });
        await db.productRevision.deleteMany({ where: { orgId } });
        await db.productVariant.deleteMany({ where: { orgId } });
        await db.collectionProduct.deleteMany({ where: { orgId } });
        await db.product.deleteMany({ where: { orgId } });
        await db.category.deleteMany({ where: { orgId } });
        await db.collection.deleteMany({ where: { orgId } });
        await db.asset.deleteMany({ where: { orgId } });
        await db.auditEvent.deleteMany({ where: { orgId } });
        await db.storefront.deleteMany({ where: { orgId } });
        await db.branch.deleteMany({ where: { orgId } });
        await db.store.deleteMany({ where: { orgId } });
        await db.membership.deleteMany({ where: { orgId } });
        await db.organization.deleteMany({ where: { id: orgId } });
        await db.user.deleteMany({ where: { email: { endsWith: "@integration.test" } } });
      }
      await db.$disconnect();
    }
  });

  it("persists carts, checkouts and orders with sequences (W4)", async () => {
    const db = createPrismaClient();
    const repos = new PrismaRepositories(db);
    const slug = `ord-${randomUUID().slice(0, 8)}`;
    let orgId: string | undefined;
    try {
      await seedUser(db, "user-it-4");
      const { organization } = await repos.organizations.createWithOwner({
        name: "Order IT",
        slug,
        ownerUserId: "user-it-4",
      });
      orgId = organization.id;
      const product = await repos.products.create({
        orgId,
        slug: "tee",
        title: "Tee",
        options: [],
      });
      const variant = await repos.variants.create({
        orgId,
        productId: product.id,
        sku: `TEE-${slug}`,
        optionValues: {},
      });
      let cart = await repos.carts.create({
        orgId,
        currency: "USD",
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      cart = await repos.carts.addItem({
        orgId,
        cartId: cart.id,
        variantId: variant.id,
        quantity: 2,
      });
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]?.quantity).toBe(2);

      const checkout = await repos.checkouts.create({
        orgId,
        cartId: cart.id,
        currency: "USD",
      });
      const seq1 = await repos.orders.nextSequence(orgId);
      expect(await repos.orders.nextSequence(orgId)).toBe(seq1 + 1);
      const order = await repos.orders.create({
        orgId,
        sequence: seq1,
        checkoutId: checkout.id,
        customerId: null,
        currency: "USD",
        status: "PENDING_PAYMENT",
        lines: [
          {
            variantId: variant.id,
            sku: variant.sku,
            title: "Tee",
            quantity: 2,
            unitPriceMinor: 2500n,
            lineTotalMinor: 5000n,
            lineDiscountMinor: 0n,
          },
        ],
        subtotalMinor: 5000n,
        discountMinor: 0n,
        totalMinor: 5000n,
      });
      expect(order.orderNumber).toBe(`SO-${String(seq1).padStart(8, "0")}`);
      expect(await repos.orders.listLines(orgId, order.id)).toHaveLength(1);

      const idem = await repos.idempotency.start({
        orgId,
        key: `order-${randomUUID()}`,
        requestHash: "{}",
      });
      expect(idem.status).toBe("PENDING");
    } finally {
      if (orgId) {
        await db.idempotencyRecord.deleteMany({ where: { orgId } });
        await db.orderLine.deleteMany({ where: { orgId } });
        await db.order.deleteMany({ where: { orgId } });
        await db.checkout.deleteMany({ where: { orgId } });
        await db.cartItem.deleteMany({ where: { orgId } });
        await db.cart.deleteMany({ where: { orgId } });
        await db.reservation.deleteMany({ where: { orgId } });
        await db.inventoryItem.deleteMany({ where: { orgId } });
        await db.price.deleteMany({ where: { orgId } });
        await db.priceList.deleteMany({ where: { orgId } });
        await db.promotion.deleteMany({ where: { orgId } });
        await db.productRevision.deleteMany({ where: { orgId } });
        await db.productVariant.deleteMany({ where: { orgId } });
        await db.collectionProduct.deleteMany({ where: { orgId } });
        await db.product.deleteMany({ where: { orgId } });
        await db.category.deleteMany({ where: { orgId } });
        await db.collection.deleteMany({ where: { orgId } });
        await db.asset.deleteMany({ where: { orgId } });
        await db.auditEvent.deleteMany({ where: { orgId } });
        await db.storefront.deleteMany({ where: { orgId } });
        await db.branch.deleteMany({ where: { orgId } });
        await db.store.deleteMany({ where: { orgId } });
        await db.membership.deleteMany({ where: { orgId } });
        await db.organization.deleteMany({ where: { id: orgId } });
        await db.user.deleteMany({ where: { email: { endsWith: "@integration.test" } } });
      }
      await db.$disconnect();
    }
  });
});
