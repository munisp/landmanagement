import { readJsonStore, writeJsonStore } from './jsonStore';

export type WorkflowStatus = 'running' | 'paused' | 'completed';
export type WorkflowStepType = 'user_task' | 'automated' | 'approval';

export interface WorkflowTemplateRecord {
  id: string;
  name: string;
  description: string;
  steps: number;
  avgDuration: string;
}

export interface WorkflowInstanceRecord {
  id: string;
  name: string;
  templateId: string;
  status: WorkflowStatus;
  currentStep: string;
  progress: number;
  sla: 'On Track' | 'At Risk' | 'Delayed';
  startedAt: string;
}

export interface WorkflowStepRecord {
  id: number;
  name: string;
  type: WorkflowStepType;
  assignee: string;
  duration: string;
  conditions: string[];
}

interface WorkflowDesignerStore {
  templates: WorkflowTemplateRecord[];
  activeWorkflows: WorkflowInstanceRecord[];
  workflowSteps: WorkflowStepRecord[];
}


function defaultStore(): WorkflowDesignerStore {
  return {
    templates: [
      { id: 'land_registration', name: 'Land Registration Workflow', description: 'Standard workflow for new land parcel registration', steps: 5, avgDuration: '7 days' },
      { id: 'title_transfer', name: 'Title Transfer Workflow', description: 'Workflow for transferring property ownership', steps: 6, avgDuration: '14 days' },
      { id: 'subdivision', name: 'Land Subdivision Workflow', description: 'Process for subdividing existing parcels', steps: 8, avgDuration: '21 days' },
      { id: 'mortgage', name: 'Mortgage Registration Workflow', description: 'Workflow for registering property mortgages', steps: 4, avgDuration: '5 days' },
    ],
    activeWorkflows: [
      { id: 'wf-001', name: 'Land Registration - Lagos', templateId: 'land_registration', status: 'running', currentStep: 'Document Verification', progress: 60, sla: 'On Track', startedAt: '2026-02-10T00:00:00.000Z' },
      { id: 'wf-002', name: 'Title Transfer - Abuja', templateId: 'title_transfer', status: 'running', currentStep: 'Payment Processing', progress: 75, sla: 'At Risk', startedAt: '2026-02-08T00:00:00.000Z' },
      { id: 'wf-003', name: 'Subdivision - Kano', templateId: 'subdivision', status: 'paused', currentStep: 'Survey Validation', progress: 40, sla: 'Delayed', startedAt: '2026-02-05T00:00:00.000Z' },
    ],
    workflowSteps: [
      { id: 1, name: 'Application Submission', type: 'user_task', assignee: 'Applicant', duration: '1 day', conditions: [] },
      { id: 2, name: 'Document Verification', type: 'automated', assignee: 'System', duration: '2 hours', conditions: ['All documents uploaded', 'NIN verified'] },
      { id: 3, name: 'Registrar Review', type: 'approval', assignee: 'Registrar', duration: '3 days', conditions: ['Documents verified'] },
      { id: 4, name: 'Payment Processing', type: 'automated', assignee: 'System', duration: '1 hour', conditions: ['Application approved'] },
      { id: 5, name: 'Title Issuance', type: 'automated', assignee: 'System', duration: '1 day', conditions: ['Payment confirmed'] },
    ],
  };
}

async function readStore(): Promise<WorkflowDesignerStore> {
  return readJsonStore<WorkflowDesignerStore>('workflow-designer-store', defaultStore);
}

async function writeStore(store: WorkflowDesignerStore) {
  await writeJsonStore('workflow-designer-store', store);
}

export async function getWorkflowDesignerState() {
  const store = await readStore();
  const total = store.activeWorkflows.length;
  const active = store.activeWorkflows.filter((workflow) => workflow.status === 'running').length;
  const completed = store.activeWorkflows.filter((workflow) => workflow.status === 'completed').length;
  const averageProgress = total > 0
    ? Number((store.activeWorkflows.reduce((sum, workflow) => sum + workflow.progress, 0) / total).toFixed(1))
    : 0;

  return {
    workflowTemplates: store.templates,
    activeWorkflows: store.activeWorkflows,
    workflowSteps: store.workflowSteps,
    analytics: {
      totalWorkflows: total,
      active,
      completed,
      avgDuration: `${averageProgress} days`,
    },
  };
}

export async function createWorkflowInstance(input: { workflowName: string; templateId: string }) {
  const store = await readStore();
  const template = store.templates.find((item) => item.id === input.templateId);
  if (!template) {
    throw new Error('Workflow template not found');
  }

  const workflow: WorkflowInstanceRecord = {
    id: `wf-${Date.now()}`,
    name: input.workflowName,
    templateId: template.id,
    status: 'running',
    currentStep: store.workflowSteps[0]?.name ?? 'Application Submission',
    progress: 10,
    sla: 'On Track',
    startedAt: new Date().toISOString(),
  };

  store.activeWorkflows.unshift(workflow);
  await writeStore(store);
  return workflow;
}
