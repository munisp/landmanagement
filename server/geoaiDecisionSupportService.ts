import { z } from "zod";

const criterionSchema = z.object({
  id: z.string().min(2).max(96),
  label: z.string().min(2).max(255),
  direction: z.enum(["benefit", "cost"]),
  weight: z.number().positive().max(1),
  sourceAssetId: z.string().min(6).max(128),
});

const alternativeSchema = z.object({
  id: z.string().min(2).max(128),
  label: z.string().min(2).max(255),
  values: z.record(z.string(), z.number().finite()),
});

export const suitabilityRequestSchema = z.object({
  criteria: z.array(criterionSchema).min(2).max(32),
  alternatives: z.array(alternativeSchema).min(2).max(500),
  sensitivityDelta: z.number().min(0.01).max(0.25).default(0.1),
});

export type SuitabilityRequest = z.infer<typeof suitabilityRequestSchema>;

function normaliseWeights(criteria: SuitabilityRequest["criteria"]) {
  const total = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (Math.abs(total - 1) > 0.000001) {
    throw new Error(`Suitability criteria weights must sum to exactly 1.0; received ${total}`);
  }
  return criteria;
}

function normalisedValue(value: number, min: number, max: number, direction: "benefit" | "cost") {
  if (max === min) throw new Error("Suitability analysis cannot normalize a criterion with no variation across alternatives");
  const base = (value - min) / (max - min);
  return direction === "benefit" ? base : 1 - base;
}

function rankAlternatives(criteria: SuitabilityRequest["criteria"], alternatives: SuitabilityRequest["alternatives"]) {
  const bounds = new Map<string, { min: number; max: number }>();
  for (const criterion of criteria) {
    const values = alternatives.map((alternative) => {
      const value = alternative.values[criterion.id];
      if (value === undefined) throw new Error(`Alternative ${alternative.id} is missing a value for criterion ${criterion.id}`);
      return value;
    });
    bounds.set(criterion.id, { min: Math.min(...values), max: Math.max(...values) });
  }

  return alternatives.map((alternative) => {
    const contributions = criteria.map((criterion) => {
      const bound = bounds.get(criterion.id)!;
      const normalized = normalisedValue(alternative.values[criterion.id], bound.min, bound.max, criterion.direction);
      return {
        criterionId: criterion.id,
        normalizedValue: normalized,
        weight: criterion.weight,
        weightedContribution: normalized * criterion.weight,
        sourceAssetId: criterion.sourceAssetId,
      };
    });
    const score = contributions.reduce((sum, contribution) => sum + contribution.weightedContribution, 0);
    return { id: alternative.id, label: alternative.label, score, contributions };
  }).sort((left, right) => right.score - left.score);
}

function perturbWeights(criteria: SuitabilityRequest["criteria"], targetId: string, delta: number) {
  const target = criteria.find((criterion) => criterion.id === targetId);
  if (!target) throw new Error(`Criterion ${targetId} was not found`);
  const increased = Math.min(target.weight + delta, 0.99);
  const remainingOriginal = 1 - target.weight;
  const remainingNew = 1 - increased;
  if (remainingOriginal <= 0 || remainingNew <= 0) return criteria;
  return criteria.map((criterion) => criterion.id === targetId
    ? { ...criterion, weight: increased }
    : { ...criterion, weight: criterion.weight / remainingOriginal * remainingNew });
}

/**
 * Computes a fully traceable weighted suitability ranking. Every criterion must
 * name the source asset that established its values; the caller persists the
 * returned contribution and sensitivity evidence with the GeoAI analysis run.
 */
export function evaluateSuitability(rawRequest: unknown) {
  const request = suitabilityRequestSchema.parse(rawRequest);
  const criteria = normaliseWeights(request.criteria);
  const ranking = rankAlternatives(criteria, request.alternatives);
  const baselineLeader = ranking[0]?.id;
  const sensitivity = criteria.map((criterion) => {
    const perturbed = rankAlternatives(perturbWeights(criteria, criterion.id, request.sensitivityDelta), request.alternatives);
    return {
      criterionId: criterion.id,
      perturbedLeaderId: perturbed[0]?.id,
      leaderChanged: baselineLeader !== perturbed[0]?.id,
    };
  });

  return {
    status: "computed",
    method: "weighted_linear_combination",
    criteria: criteria.map((criterion) => ({
      id: criterion.id,
      label: criterion.label,
      direction: criterion.direction,
      weight: criterion.weight,
      sourceAssetId: criterion.sourceAssetId,
    })),
    ranking: ranking.map((entry, index) => ({ ...entry, rank: index + 1 })),
    sensitivity: {
      delta: request.sensitivityDelta,
      leaderStableAcrossSingleCriterionPerturbations: sensitivity.every((entry) => !entry.leaderChanged),
      scenarios: sensitivity,
    },
    evidenceStatus: "provisional",
    humanReviewRequired: true,
  };
}
