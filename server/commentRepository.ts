import fs from 'fs';
import path from 'path';

export interface CommentRecord {
  id: number;
  entityType: 'parcel' | 'transaction';
  entityId: string;
  userId: number;
  userName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface CommentStore {
  nextId: number;
  comments: CommentRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'comment-store.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function seededComments(): CommentRecord[] {
  return [
    {
      id: 1,
      entityType: 'parcel',
      entityId: '1',
      userId: 12,
      userName: 'Registry Officer Amina Bello',
      content: 'Boundary verification completed and supporting survey evidence has been attached.',
      createdAt: '2026-05-12T09:20:00.000Z',
      updatedAt: '2026-05-12T09:20:00.000Z',
    },
    {
      id: 2,
      entityType: 'transaction',
      entityId: '1',
      userId: 34,
      userName: 'Transaction Clerk Musa Yusuf',
      content: 'Payment review is complete and the transaction is ready for registry approval.',
      createdAt: '2026-05-13T11:10:00.000Z',
      updatedAt: '2026-05-13T11:10:00.000Z',
    },
  ];
}

function defaultStore(): CommentStore {
  const comments = seededComments();
  return {
    nextId: Math.max(...comments.map((item) => item.id), 0) + 1,
    comments,
  };
}

function loadStore(): CommentStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as CommentStore;
    if (!Array.isArray(parsed.comments) || typeof parsed.nextId !== 'number') {
      const store = defaultStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
      return store;
    }
    return parsed;
  } catch {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
}

function saveStore(store: CommentStore) {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function listComments(input: { entityType: 'parcel' | 'transaction'; entityId: string }) {
  return loadStore().comments
    .filter((comment) => comment.entityType === input.entityType && comment.entityId === input.entityId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addComment(input: {
  entityType: 'parcel' | 'transaction';
  entityId: string;
  userId: number;
  userName: string;
  content: string;
}) {
  const store = loadStore();
  const timestamp = new Date().toISOString();
  const record: CommentRecord = {
    id: store.nextId,
    entityType: input.entityType,
    entityId: input.entityId,
    userId: input.userId,
    userName: input.userName,
    content: input.content,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.comments.push(record);
  store.nextId += 1;
  saveStore(store);
  return record;
}

export function getCommentById(id: number) {
  return loadStore().comments.find((comment) => comment.id === id) ?? null;
}

export function editComment(input: { id: number; userId: number; content: string }) {
  const store = loadStore();
  const record = store.comments.find((comment) => comment.id === input.id && comment.userId === input.userId);
  if (!record) {
    throw new Error('Comment not found');
  }
  record.content = input.content;
  record.updatedAt = new Date().toISOString();
  saveStore(store);
  return record;
}

export function deleteComment(input: { id: number; userId: number }) {
  const store = loadStore();
  const originalLength = store.comments.length;
  store.comments = store.comments.filter((comment) => !(comment.id === input.id && comment.userId === input.userId));
  if (store.comments.length === originalLength) {
    throw new Error('Comment not found');
  }
  saveStore(store);
  return { success: true };
}
