import { useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { GraduationCap, BadgeCheck, Gauge, HelpCircle } from 'lucide-react';

const rolePaths = [
  { role: 'Registrar', modules: ['Parcel validation', 'Title review', 'Escalation handling'], completion: 82 },
  { role: 'Surveyor', modules: ['Boundary verification', 'Spatial review', 'Compliance evidence'], completion: 76 },
  { role: 'Field Officer', modules: ['Mobile capture', 'Citizen intake', 'Offline sync discipline'], completion: 69 },
];

export default function TrainingSupportCenter() {
  const [selectedRole, setSelectedRole] = useState('Registrar');
  const [simulationScenario, setSimulationScenario] = useState('Mortgage approval walkthrough');
  const [contextPrompt, setContextPrompt] = useState('Offer inline guidance when users pause on required legal-document fields or incomplete parcel validation steps.');

  const activePath = rolePaths.find((item) => item.role === selectedRole) ?? rolePaths[0];

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Training & Support Center</h1>
        <p className="text-muted-foreground mt-2">Manage role-based training, certification posture, simulation guidance, contextual help, integrated support workflows, knowledge-base access, and community learning paths.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Selected training role</p><p className="mt-2 text-2xl font-semibold">{activePath.role}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Completion rate</p><p className="mt-2 text-2xl font-semibold">{activePath.completion}%</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Certification posture</p><p className="mt-2 text-2xl font-semibold">Badge-ready</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle><GraduationCap className="inline mr-2 h-4 w-4" />Role-based learning configuration</CardTitle><CardDescription>Review training paths, simulation themes, contextual help prompts, and certification posture.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Training role</Label><Input value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} /></div>
            <div className="space-y-2"><Label>Simulation scenario</Label><Input value={simulationScenario} onChange={(e) => setSimulationScenario(e.target.value)} /></div>
            <div className="space-y-2"><Label>Contextual help prompt</Label><Input value={contextPrompt} onChange={(e) => setContextPrompt(e.target.value)} /></div>
            <div className="rounded-lg border p-4">
              <p className="font-medium mb-2">Current learning modules</p>
              <div className="flex flex-wrap gap-2">{activePath.modules.map((module) => <Badge key={module} variant="outline">{module}</Badge>)}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><Gauge className="inline mr-2 h-4 w-4" />Support and readiness workspace</CardTitle><CardDescription>Use the existing platform support, knowledge, and community surfaces as the operational backbone for training delivery.</CardDescription></CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1"><BadgeCheck className="inline mr-2 h-4 w-4" />Certification and badges</p><p>Completion progress can be used to grant role-readiness badges and escalation privileges for regulated workflows.</p></div>
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1">Simulation environment</p><p>{simulationScenario} is used as the guided practice scenario for new staff before entering live operations.</p></div>
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1"><HelpCircle className="inline mr-2 h-4 w-4" />Contextual help detection</p><p>{contextPrompt}</p></div>
            <div className="flex flex-wrap gap-3">
              <Button asChild><Link href="/support-center">Open Support Center</Link></Button>
              <Button variant="outline" asChild><Link href="/community-engagement-center">Open Community Forums</Link></Button>
              <Button variant="outline" asChild><Link href="/settings">Open Settings</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
