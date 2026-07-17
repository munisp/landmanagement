import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { GitBranch, Save, Plus, Clock, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function WorkflowDesigner() {
  const [workflowName, setWorkflowName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.workflowDesigner.state.useQuery();
  const createMutation = trpc.workflowDesigner.create.useMutation({
    onSuccess: async () => {
      toast.success(`Workflow created successfully`);
      setWorkflowName("");
      await utils.workflowDesigner.state.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const createWorkflow = () => {
    if (!workflowName || !selectedTemplate) {
      toast.error("Please provide workflow name and select a template");
      return;
    }
    createMutation.mutate({ workflowName, templateId: selectedTemplate });
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading workflow engine...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/admin">
            <Button variant="ghost" className="gap-2">
              ← Back to Admin
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Workflow Designer</h1>
          <Button className="gap-2" onClick={createWorkflow}>
            <Plus className="h-4 w-4" />
            New Workflow
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
              <GitBranch className="h-10 w-10" />
              Automated Workflow Engine
            </h1>
            <p className="text-lg text-muted-foreground">
              Design, launch, and monitor deterministic workflow instances across land-registry operations.
            </p>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Workflow Templates</CardTitle>
              <CardDescription>
                Pre-configured workflow templates for common land registry processes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {data.workflowTemplates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${selectedTemplate === template.id ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
                    onClick={() => setSelectedTemplate(template.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold">{template.name}</h3>
                      <Badge variant="outline">{template.steps} steps</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {template.avgDuration}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <h3 className="font-semibold">Create New Workflow Instance</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="workflow-name">Workflow Name</Label>
                    <Input
                      id="workflow-name"
                      placeholder="e.g., Land Registration - Lagos Zone A"
                      value={workflowName}
                      onChange={(e) => setWorkflowName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Selected Template</Label>
                    <Input
                      value={data.workflowTemplates.find((t) => t.id === selectedTemplate)?.name || "None"}
                      disabled
                    />
                  </div>
                </div>
                <Button onClick={createWorkflow} className="gap-2" disabled={createMutation.isPending}>
                  <Save className="h-4 w-4" />
                  {createMutation.isPending ? "Creating..." : "Create Workflow"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Active Workflows</CardTitle>
              <CardDescription>
                Currently tracked workflow instances with SLA monitoring
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.activeWorkflows.map((workflow) => (
                  <div key={workflow.id} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold mb-1">{workflow.name}</h3>
                        <p className="text-sm text-muted-foreground">Current Step: {workflow.currentStep}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={workflow.status === "running" ? "default" : workflow.status === "paused" ? "secondary" : "outline"}>
                          {workflow.status}
                        </Badge>
                        <Badge variant={workflow.sla === "On Track" ? "outline" : workflow.sla === "At Risk" ? "secondary" : "destructive"}>
                          {workflow.sla}
                        </Badge>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{workflow.progress}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${workflow.progress}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Started: {new Date(workflow.startedAt).toLocaleDateString()}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => toast.info(`Workflow ${workflow.id} is tracked through the live workflow state`)}>
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workflow Designer Canvas</CardTitle>
              <CardDescription>
                Current step sequence and gating conditions for the live workflow template model
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.workflowSteps.map((step, index) => (
                  <div key={step.id} className="relative">
                    <div className="flex items-start gap-4 p-4 border rounded-lg">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                        {step.id}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-semibold">{step.name}</h4>
                            <p className="text-sm text-muted-foreground">Assignee: {step.assignee} • Duration: {step.duration}</p>
                          </div>
                          <Badge variant="outline">{step.type}</Badge>
                        </div>
                        {step.conditions.length > 0 && (
                          <div className="flex items-start gap-2 text-sm">
                            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                            <div>
                              <p className="font-medium text-yellow-900">Conditions:</p>
                              <ul className="text-yellow-800 text-xs space-y-1">
                                {step.conditions.map((condition, i) => (
                                  <li key={i}>• {condition}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {index < data.workflowSteps.length - 1 && (
                      <div className="flex justify-center py-2">
                        <div className="w-0.5 h-6 bg-border" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Workflow Analytics</CardTitle>
              <CardDescription>
                Operational workflow volumes and current progress benchmarks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Total Workflows</p>
                  <p className="text-2xl font-bold">{data.analytics.totalWorkflows}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Active</p>
                  <p className="text-2xl font-bold text-green-600">{data.analytics.active}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Completed</p>
                  <p className="text-2xl font-bold text-blue-600">{data.analytics.completed}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Avg Duration</p>
                  <p className="text-2xl font-bold">{data.analytics.avgDuration}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
