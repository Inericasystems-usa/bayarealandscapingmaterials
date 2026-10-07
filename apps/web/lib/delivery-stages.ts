import type { DeliveryStage } from "@/lib/api-client";

/**
 * Driver delivery stages — optimized titles + the action label that advances
 * to the NEXT stage. Shared by the driver app (progress) and the dispatch board.
 */
export const STAGE_ORDER: DeliveryStage[] = [
  "assigned",
  "loading",
  "loaded",
  "to_customer",
  "arrived",
  "unloading",
  "unloaded",
  "returning",
  "completed",
];

export const STAGE_META: Record<
  DeliveryStage,
  { label: string; short: string; next?: DeliveryStage; action?: string }
> = {
  assigned: { label: "Assigned", short: "Assigned", next: "loading", action: "Start Loading" },
  loading: { label: "Loading at yard", short: "Loading", next: "loaded", action: "Load Complete" },
  loaded: { label: "Loaded", short: "Loaded", next: "to_customer", action: "Depart Yard" },
  to_customer: { label: "En route to site", short: "En route", next: "arrived", action: "Arrived at Site" },
  arrived: { label: "At customer site", short: "On site", next: "unloading", action: "Start Unloading" },
  unloading: { label: "Unloading", short: "Unloading", next: "unloaded", action: "Unloading Done" },
  unloaded: { label: "Unloaded", short: "Unloaded", next: "returning", action: "Depart Site" },
  returning: { label: "Returning to yard", short: "Returning", next: "completed", action: "Back at Yard — Finish" },
  completed: { label: "Completed", short: "Done" },
};

export function stageIndex(stage: DeliveryStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function nextStage(stage: DeliveryStage): DeliveryStage | null {
  return STAGE_META[stage].next ?? null;
}

/** A token color for the stage badge. */
export function stageColor(stage: DeliveryStage): string {
  if (stage === "completed") return "var(--color-success)";
  if (stage === "assigned") return "var(--color-text-muted)";
  if (stage === "loading" || stage === "loaded") return "var(--color-warning)";
  return "var(--color-info)";
}
