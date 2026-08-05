import { runCommercialBillingCycle } from "../server/commercialLenderService";

function integerConfig(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

export async function reconcileCommercialBilling() {
  const graceDays = integerConfig("COMMERCIAL_BILLING_GRACE_DAYS", 7, 0, 90);
  return runCommercialBillingCycle({ graceDays });
}
