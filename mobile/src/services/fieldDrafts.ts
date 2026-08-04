import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import { isOnline, MobileApiError, createGeoAiRun, queueGeoAiRun } from "./api";
import { uploadAndRegisterFieldEvidence, type CapturedFieldEvidence } from "./fieldEvidence";

const ROOT = `${FileSystem.documentDirectory ?? ""}geoai-field-drafts/`;
const INDEX = `${ROOT}index.json`;

export type FieldDraftStatus = "pending" | "syncing" | "synced" | "conflict" | "failed";

export type FieldDraft = {
  id: string;
  revision: number;
  status: FieldDraftStatus;
  title: string;
  purpose: string;
  parcelId?: number;
  captured: CapturedFieldEvidence;
  createdAt: string;
  updatedAt: string;
  synchronizedRunId?: number;
  conflictReason?: string;
  lastError?: string;
};

async function ensureRoot() {
  const directory = await FileSystem.getInfoAsync(ROOT);
  if (!directory.exists) await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
}

async function loadIndex(): Promise<FieldDraft[]> {
  await ensureRoot();
  const index = await FileSystem.getInfoAsync(INDEX);
  if (!index.exists) return [];
  const raw = await FileSystem.readAsStringAsync(INDEX, { encoding: FileSystem.EncodingType.UTF8 });
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Draft index is not an array");
    return parsed as FieldDraft[];
  } catch {
    throw new Error("The local field-draft index is unreadable. Do not collect more evidence until the device storage issue is resolved.");
  }
}

async function saveIndex(drafts: FieldDraft[]) {
  await ensureRoot();
  const temporary = `${INDEX}.tmp`;
  await FileSystem.writeAsStringAsync(temporary, JSON.stringify(drafts, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
  await FileSystem.moveAsync({ from: temporary, to: INDEX });
}

function extensionFor(uri: string, mediaType: string): string {
  const fromUri = uri.split("?")[0].split(".").pop();
  if (fromUri && /^[a-z0-9]{2,5}$/i.test(fromUri)) return fromUri.toLowerCase();
  return mediaType === "image/png" ? "png" : "jpg";
}

export async function listFieldDrafts(): Promise<FieldDraft[]> {
  const drafts = await loadIndex();
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveFieldDraft(input: { title: string; purpose: string; parcelId?: number; captured: CapturedFieldEvidence }): Promise<FieldDraft> {
  const drafts = await loadIndex();
  const id = `draft-${Crypto.randomUUID()}`;
  const offlinePath = `${ROOT}${id}.${extensionFor(input.captured.localUri, input.captured.mediaType)}`;
  await FileSystem.copyAsync({ from: input.captured.localUri, to: offlinePath });
  const now = new Date().toISOString();
  const draft: FieldDraft = {
    id,
    revision: 1,
    status: "pending",
    title: input.title.trim(),
    purpose: input.purpose.trim(),
    parcelId: input.parcelId,
    captured: { ...input.captured, localUri: offlinePath },
    createdAt: now,
    updatedAt: now,
  };
  await saveIndex([draft, ...drafts]);
  return draft;
}

export async function updateFieldDraft(draftId: string, patch: Partial<Pick<FieldDraft, "title" | "purpose" | "parcelId" | "status" | "conflictReason" | "lastError">>): Promise<FieldDraft> {
  const drafts = await loadIndex();
  const position = drafts.findIndex((draft) => draft.id === draftId);
  if (position < 0) throw new Error("The requested offline field draft no longer exists");
  const next: FieldDraft = { ...drafts[position], ...patch, revision: drafts[position].revision + 1, updatedAt: new Date().toISOString() };
  drafts[position] = next;
  await saveIndex(drafts);
  return next;
}

export async function deleteFieldDraft(draftId: string): Promise<void> {
  const drafts = await loadIndex();
  const draft = drafts.find((item) => item.id === draftId);
  if (!draft) return;
  const file = await FileSystem.getInfoAsync(draft.captured.localUri);
  if (file.exists) await FileSystem.deleteAsync(draft.captured.localUri, { idempotent: true });
  await saveIndex(drafts.filter((item) => item.id !== draftId));
}

function conflictFrom(error: unknown): string | null {
  if (error instanceof MobileApiError && (error.status === 409 || error.code === "CONFLICT" || error.code === "NOT_FOUND")) return error.message;
  return null;
}

export async function syncFieldDraft(draftId: string, accessToken: string): Promise<FieldDraft> {
  if (!(await isOnline())) throw new Error("This device is offline. Synchronization must be started deliberately after connectivity is restored.");
  const drafts = await loadIndex();
  const draft = drafts.find((item) => item.id === draftId);
  if (!draft) throw new Error("The requested offline field draft no longer exists");
  if (draft.status === "synced") return draft;
  if (draft.title.length < 3 || draft.purpose.length < 10) throw new Error("Complete the draft title and purpose before synchronizing field evidence");

  await updateFieldDraft(draftId, { status: "syncing", lastError: undefined, conflictReason: undefined });
  try {
    const asset = await uploadAndRegisterFieldEvidence({ captured: draft.captured, parcelId: draft.parcelId, accessToken });
    const created = await createGeoAiRun({
      analysisType: "field_evidence_review",
      title: draft.title,
      purpose: draft.purpose,
      parcelId: draft.parcelId,
      sourceAssets: [asset],
      methodParameters: { submittedFrom: "idlr-native-offline-draft", localDraftId: draft.id, localRevision: draft.revision },
      legalOrRegulatoryUse: false,
      allowProvisionalOutput: true,
    }, accessToken);
    await queueGeoAiRun(created.run.id, accessToken);
    const synced = await updateFieldDraft(draftId, { status: "synced", lastError: undefined, conflictReason: undefined });
    const draftsAfter = await loadIndex();
    const index = draftsAfter.findIndex((item) => item.id === draftId);
    if (index >= 0) {
      draftsAfter[index] = { ...synced, synchronizedRunId: created.run.id, updatedAt: new Date().toISOString(), revision: synced.revision + 1 };
      await saveIndex(draftsAfter);
      return draftsAfter[index];
    }
    return synced;
  } catch (error) {
    const conflict = conflictFrom(error);
    return updateFieldDraft(draftId, {
      status: conflict ? "conflict" : "failed",
      conflictReason: conflict ?? undefined,
      lastError: error instanceof Error ? error.message : "The field draft could not be synchronized",
    });
  }
}

export async function duplicateFieldDraft(draftId: string): Promise<FieldDraft> {
  const drafts = await loadIndex();
  const original = drafts.find((item) => item.id === draftId);
  if (!original) throw new Error("The requested field draft no longer exists");
  const id = `draft-${Crypto.randomUUID()}`;
  const nextPath = `${ROOT}${id}.${extensionFor(original.captured.localUri, original.captured.mediaType)}`;
  await FileSystem.copyAsync({ from: original.captured.localUri, to: nextPath });
  const now = new Date().toISOString();
  const duplicate: FieldDraft = {
    ...original,
    id,
    revision: 1,
    status: "pending",
    captured: { ...original.captured, localUri: nextPath },
    createdAt: now,
    updatedAt: now,
    synchronizedRunId: undefined,
    conflictReason: undefined,
    lastError: undefined,
  };
  await saveIndex([duplicate, ...drafts]);
  return duplicate;
}
