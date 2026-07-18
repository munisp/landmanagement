import { readJsonStore, writeJsonStore } from './jsonStore';

export interface CollaborationParticipant {
  id: number;
  name: string;
  role: string;
  status: 'online' | 'away';
  cursor: { x: number; y: number } | null;
}

export interface CollaborationMessage {
  id: number;
  sender: string;
  message: string;
  time: string;
}

export interface CollaborationAnnotation {
  id: number;
  author: string;
  text: string;
  x: number;
  y: number;
  color: string;
}

export interface CollaborationDocument {
  id: number;
  name: string;
  annotations: number;
}

interface CollaborationStore {
  participants: CollaborationParticipant[];
  messages: CollaborationMessage[];
  annotations: CollaborationAnnotation[];
  documents: CollaborationDocument[];
  nextMessageId: number;
}


function defaultStore(): CollaborationStore {
  return {
    participants: [
      { id: 1, name: 'John Surveyor', role: 'Surveyor', status: 'online', cursor: { x: 120, y: 240 } },
      { id: 2, name: 'Mary Registrar', role: 'Registrar', status: 'online', cursor: { x: 350, y: 180 } },
      { id: 3, name: 'David Citizen', role: 'Citizen', status: 'away', cursor: null },
    ],
    messages: [
      { id: 1, sender: 'John Surveyor', message: "I've marked the boundary points on the map", time: '10:30 AM' },
      { id: 2, sender: 'Mary Registrar', message: 'Looks good. Let me verify the coordinates', time: '10:32 AM' },
      { id: 3, sender: 'David Citizen', message: 'When can we schedule the site visit?', time: '10:35 AM' },
    ],
    annotations: [
      { id: 1, author: 'John Surveyor', text: 'Check this boundary', x: 150, y: 200, color: '#3b82f6' },
      { id: 2, author: 'Mary Registrar', text: 'Approved', x: 300, y: 250, color: '#10b981' },
    ],
    documents: [
      { id: 1, name: 'Survey Plan.pdf', annotations: 2 },
      { id: 2, name: 'Title Certificate.pdf', annotations: 1 },
    ],
    nextMessageId: 4,
  };
}

async function loadStore(): Promise<CollaborationStore> {
  return readJsonStore<CollaborationStore>('collaboration-store', defaultStore);
}

async function saveStore(store: CollaborationStore) {
  await writeJsonStore('collaboration-store', store);
}

export async function getCollaborationState() {
  return await loadStore();
}

export async function addCollaborationMessage(sender: string, message: string) {
  const store = await loadStore();
  const record: CollaborationMessage = {
    id: store.nextMessageId++,
    sender,
    message,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
  store.messages.push(record);
  store.messages = store.messages.slice(-50);
  await saveStore(store);
  return record;
}
