import { seedDemoStore } from "./actions";

export const dynamic = "force-dynamic";

async function seedAction(): Promise<{ ok: boolean; message: string }> {
  "use server";
  return seedDemoStore();
}

export default function SetupPage() {
  return (
    <>
      <h1>Demo store setup</h1>
      <p className="muted">
        Seeds the demo organization, one priced ACTIVE product, and a
        published page. Requires PostgreSQL from <code>infra/docker</code> and
        the migrations applied.
      </p>
      <form
        action={async () => {
          "use server";
          await seedAction();
        }}
      >
        <button type="submit">Seed demo store</button>
      </form>
      <p className="muted">
        Idempotent: running it again is safe. After seeding, open the shop.
      </p>
    </>
  );
}
