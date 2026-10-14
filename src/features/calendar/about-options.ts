import "server-only";
import { getAssets } from "@/features/assets/queries";
import { getFamilyMembers } from "@/features/family/queries";
import type { HouseholdContext } from "@/lib/auth/context";
import type { AboutOptions } from "./components/event-form";

/** Family members and assets that an event, transaction or document can be about. */
export async function getAboutOptions(ctx: HouseholdContext): Promise<AboutOptions> {
  const [family, assets] = await Promise.all([getFamilyMembers(ctx), getAssets(ctx)]);
  return {
    familyMembers: family.map((m) => ({ id: m.id, name: m.preferred_name ?? m.full_name })),
    assets: assets.map((a) => ({ id: a.id, name: a.name })),
  };
}
