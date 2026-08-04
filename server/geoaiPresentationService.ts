import { getGeoAnalysisRun, parseGeoAnalysisManifest } from "./geoaiEvidenceService";

function checkpointSummary(checkpoints: Array<{ required: boolean; status: string }>) {
  const required = checkpoints.filter((checkpoint) => checkpoint.required);
  return {
    total: checkpoints.length,
    required: required.length,
    passed: required.filter((checkpoint) => checkpoint.status === "passed").length,
    waived: required.filter((checkpoint) => checkpoint.status === "waived").length,
    failed: required.filter((checkpoint) => checkpoint.status === "failed").length,
    pending: required.filter((checkpoint) => checkpoint.status === "pending").length,
  };
}

export async function buildGeoAiPresentation(runId: number) {
  const stored = await getGeoAnalysisRun(runId);
  if (!stored) throw new Error(`GeoAI analysis run ${runId} was not found`);
  const manifest = parseGeoAnalysisManifest(stored.run.inputManifest);
  const summary = checkpointSummary(stored.checkpoints);
  const displayAllowed = stored.run.evidenceStatus === "verified";

  return {
    run: {
      id: stored.run.id,
      runKey: stored.run.runKey,
      title: stored.run.title,
      analysisType: stored.run.analysisType,
      status: stored.run.status,
      evidenceStatus: stored.run.evidenceStatus,
      policyVersion: stored.run.policyVersion,
      requestedAt: stored.run.createdAt,
      completedAt: stored.run.completedAt,
      reviewedAt: stored.run.reviewedAt,
    },
    display: {
      allowedForDecisionPresentation: displayAllowed,
      banner: displayAllowed
        ? "Verified GeoAI evidence. Review provenance and uncertainty before operational use."
        : `This result is ${stored.run.evidenceStatus.replace(/_/g, " ")}. It must not be presented as a verified decision outcome.`,
      checkpointSummary: summary,
    },
    provenance: {
      purpose: manifest.purpose,
      legalOrRegulatoryUse: manifest.legalOrRegulatoryUse,
      analysisCrs: manifest.analysisCrs ?? null,
      outputCrs: manifest.outputCrs ?? null,
      sourceAssets: manifest.sourceAssets.map((asset) => ({
        assetId: asset.assetId,
        assetType: asset.assetType,
        dataSource: asset.dataSource,
        uri: asset.uri,
        checksumSha256: asset.checksumSha256 ?? null,
        sourceCrs: asset.sourceCrs ?? null,
        verticalCrs: asset.verticalCrs ?? null,
        acquiredAt: asset.acquiredAt ?? null,
      })),
    },
    layers: stored.artifacts.map((artifact) => ({
      artifactId: artifact.id,
      artifactType: artifact.artifactType,
      uri: artifact.uri,
      mediaType: artifact.mediaType,
      isPrimary: artifact.isPrimary,
      checksumSha256: artifact.checksumSha256,
      metadata: artifact.metadata,
      usableForVerifiedPresentation: displayAllowed,
    })),
    qualityGates: stored.checkpoints.map((checkpoint) => ({
      key: checkpoint.checkpointKey,
      name: checkpoint.checkpointName,
      required: checkpoint.required,
      status: checkpoint.status,
      evidence: checkpoint.evidence,
      completedAt: checkpoint.fulfilledAt,
      notes: checkpoint.notes,
    })),
    resultSummary: stored.run.resultSummary,
    uncertaintySummary: stored.run.uncertaintySummary,
    reviewNotes: stored.run.reviewNotes,
  };
}

export async function buildGeoAiEvidenceReport(runId: number) {
  const presentation = await buildGeoAiPresentation(runId);
  const report = [
    `# ${presentation.run.title}`,
    "",
    `**Run:** ${presentation.run.runKey}`,
    `**Analysis type:** ${presentation.run.analysisType}`,
    `**Evidence status:** ${presentation.run.evidenceStatus}`,
    `**Policy version:** ${presentation.run.policyVersion}`,
    "",
    "## Decision-use statement",
    "",
    presentation.display.banner,
    "",
    "## Purpose and provenance",
    "",
    presentation.provenance.purpose,
    "",
    "| Source asset | Type | Source | CRS | Checksum |",
    "|---|---|---|---|---|",
    ...presentation.provenance.sourceAssets.map((asset) => `| ${asset.assetId} | ${asset.assetType} | ${asset.dataSource} | ${asset.sourceCrs ?? "Not declared"} | ${asset.checksumSha256 ?? "Not supplied"} |`),
    "",
    "## Verification gates",
    "",
    "| Gate | Required | Status | Notes |",
    "|---|---:|---|---|",
    ...presentation.qualityGates.map((gate) => `| ${gate.name} | ${gate.required ? "Yes" : "No"} | ${gate.status} | ${gate.notes ?? ""} |`),
    "",
    "## Result summary",
    "",
    "```json",
    JSON.stringify(presentation.resultSummary ?? {}, null, 2),
    "```",
    "",
    "## Uncertainty and limitations",
    "",
    "```json",
    JSON.stringify(presentation.uncertaintySummary ?? {}, null, 2),
    "```",
  ].join("\n");
  return { ...presentation, markdown: report };
}
