"use server";

import { revalidatePath } from "next/cache";
import { getDemoOrgId, getOperatorContext, getRepos } from "../../../lib/kernel";
import { cancelOrder } from "@finalshop/application";

export async function cancelOrderAction(formData: FormData) {
  const orgId = await getDemoOrgId();
  const repos = getRepos();
  const ctx = await getOperatorContext();
  await cancelOrder(repos, ctx, {
    orgId,
    orderId: String(formData.get("orderId")),
  });
  revalidatePath(`/orders/${String(formData.get("orderNumber"))}`);
  revalidatePath("/orders");
}
