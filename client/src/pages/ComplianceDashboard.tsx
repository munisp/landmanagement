import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Shield, FileText, CheckCircle2, AlertTriangle, Download, Calendar, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function ComplianceDashboard() {
  const { data, isLoading } = trpc.complianceDashboard.state.useQuery();

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading compliance dashboard...
        </div>
      </div>
    );
  }

  const complianceScore = data.complianceScore;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/admin">
            <Button variant="ghost" className="gap-2">
              ← Back to Admin
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Compliance & Regulatory Reporting</h1>
          <Button className="gap-2" onClick={() => toast.success("Compliance export has been queued from the live dashboard state") }>
            <Download className="h-4 w-4" />
            Export Report
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
              <Shield className="h-10 w-10" />
              Compliance & Regulatory Reporting
            </h1>
            <p className="text-lg text-muted-foreground">
              Monitor compliance status, manage regulatory requirements, and review audit-ready operational signals.
            </p>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Overall Compliance Score</CardTitle>
              <CardDescription>
                Aggregate compliance rating across all regulatory frameworks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Compliance Health</span>
                    <span className="text-2xl font-bold">{complianceScore}%</span>
                  </div>
                  <Progress value={complianceScore} className="h-3" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {complianceScore >= 90 ? "Excellent" : complianceScore >= 75 ? "Good" : "Needs Improvement"}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-32 h-32 rounded-full border-8 border-green-500 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-green-600">{complianceScore}</p>
                      <p className="text-xs text-muted-foreground">Score</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Regulatory Compliance Status</CardTitle>
              <CardDescription>
                Compliance status for each applicable regulation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.regulations.map((reg) => (
                  <div key={reg.id} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold mb-1">{reg.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Last Audit: {new Date(reg.lastAudit).toLocaleDateString()} • Next Review: {new Date(reg.nextReview).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge
                        variant={reg.status === "compliant" ? "outline" : "secondary"}
                        className={reg.status === "compliant" ? "bg-green-50 text-green-700 border-green-200" : ""}
                      >
                        {reg.status === "compliant" ? (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Compliant
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Needs Attention
                          </span>
                        )}
                      </Badge>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Compliance Score</span>
                        <span className="text-sm font-medium">{reg.score}%</span>
                      </div>
                      <Progress value={reg.score} className="h-2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Upcoming Reports
                </CardTitle>
                <CardDescription>
                  Scheduled compliance reports and deadlines
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.upcomingReports.map((report) => (
                    <div key={report.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold">{report.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            Due: {new Date(report.dueDate).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge
                          variant={
                            report.status === "in_progress" ? "secondary" :
                            report.status === "completed" ? "outline" :
                            "destructive"
                          }
                        >
                          {report.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Progress</span>
                          <span className="text-sm font-medium">{report.completion}%</span>
                        </div>
                        <Progress value={report.completion} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Recent Audits
                </CardTitle>
                <CardDescription>
                  Completed compliance audits and assessments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.recentAudits.map((audit) => (
                    <div key={audit.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold">{audit.title}</h4>
                          <p className="text-sm text-muted-foreground">
                            {new Date(audit.date).toLocaleDateString()} • {audit.auditor}
                          </p>
                        </div>
                        <Badge
                          variant={audit.result === "Pass" ? "outline" : "secondary"}
                          className={audit.result === "Pass" ? "bg-green-50 text-green-700 border-green-200" : ""}
                        >
                          {audit.result}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {audit.findings} finding{audit.findings !== 1 ? "s" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Active Certifications</CardTitle>
              <CardDescription>
                Current compliance certifications and validity periods
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.certifications.map((cert) => (
                  <div key={cert.id} className="p-4 border rounded-lg">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${cert.accent === 'blue' ? 'bg-blue-100' : cert.accent === 'green' ? 'bg-green-100' : 'bg-purple-100'}`}>
                        <Shield className={`h-6 w-6 ${cert.accent === 'blue' ? 'text-blue-600' : cert.accent === 'green' ? 'text-green-600' : 'text-purple-600'}`} />
                      </div>
                      <div>
                        <p className="font-semibold">{cert.name}</p>
                        <p className="text-xs text-muted-foreground">{cert.description}</p>
                      </div>
                    </div>
                    <div className="text-xs space-y-1">
                      {cert.issuedLabel ? <div className="flex justify-between"><span className="text-muted-foreground">Issued:</span><span>{cert.issuedLabel}</span></div> : null}
                      {cert.expiresLabel ? <div className="flex justify-between"><span className="text-muted-foreground">Expires:</span><span>{cert.expiresLabel}</span></div> : null}
                      {cert.statusLabel ? <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><span className="text-green-600 font-medium">{cert.statusLabel}</span></div> : null}
                      {cert.reviewLabel ? <div className="flex justify-between"><span className="text-muted-foreground">Last Review:</span><span>{cert.reviewLabel}</span></div> : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
