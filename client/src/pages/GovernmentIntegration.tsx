import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Building2,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  MapPin,
  Users,
  CreditCard,
  Vote,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const iconMap = {
  Users,
  CreditCard,
  Building2,
  MapPin,
  Vote,
  Shield,
} as const;

export default function GovernmentIntegration() {
  const [ninNumber, setNinNumber] = useState("");
  const [bvnNumber, setBvnNumber] = useState("");
  const [cacNumber, setCacNumber] = useState("");
  const [tinNumber, setTinNumber] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.governmentIntegration.state.useQuery();

  const refreshState = async () => {
    await utils.governmentIntegration.state.invalidate();
  };

  const verifyNinMutation = trpc.governmentIntegration.verifyNin.useMutation({
    onSuccess: async () => {
      toast.success("NIN verification completed successfully");
      await refreshState();
    },
    onError: (error) => toast.error(error.message),
  });

  const verifyBvnMutation = trpc.governmentIntegration.verifyBvn.useMutation({
    onSuccess: async () => {
      toast.success("BVN verification completed successfully");
      await refreshState();
    },
    onError: (error) => toast.error(error.message),
  });

  const verifyCacMutation = trpc.governmentIntegration.verifyCac.useMutation({
    onSuccess: async (result) => {
      toast[result.valid ? "success" : "error"](result.valid ? "CAC verification completed successfully" : "CAC verification failed");
      await refreshState();
    },
    onError: (error) => toast.error(error.message),
  });

  const verifyTinMutation = trpc.governmentIntegration.verifyTin.useMutation({
    onSuccess: async (result) => {
      toast[result.valid ? "success" : "error"](result.valid ? "Tax verification completed successfully" : "Tax verification failed");
      await refreshState();
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading government integrations...
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
          <h1 className="text-xl font-semibold">Government Systems Integration</h1>
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {data.integrations.filter((i) => i.status === "active").length} Active
          </Badge>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">NIN Verification</CardTitle>
                <CardDescription>Verify National Identification Number</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Enter 11-digit NIN" value={ninNumber} onChange={(e) => setNinNumber(e.target.value)} maxLength={11} />
                <Button
                  onClick={() => verifyNinMutation.mutate({ nin: ninNumber })}
                  disabled={verifyNinMutation.isPending || ninNumber.length !== 11}
                  className="w-full gap-2"
                >
                  {verifyNinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                  Verify NIN
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">BVN Verification</CardTitle>
                <CardDescription>Verify Bank Verification Number</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Enter 11-digit BVN" value={bvnNumber} onChange={(e) => setBvnNumber(e.target.value)} maxLength={11} />
                <Button
                  onClick={() => verifyBvnMutation.mutate({ bvn: bvnNumber })}
                  disabled={verifyBvnMutation.isPending || bvnNumber.length !== 11}
                  className="w-full gap-2"
                >
                  {verifyBvnMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Verify BVN
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">CAC Verification</CardTitle>
                <CardDescription>Verify Company Registration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Enter RC Number" value={cacNumber} onChange={(e) => setCacNumber(e.target.value)} />
                <Button
                  onClick={() => verifyCacMutation.mutate({ cac: cacNumber })}
                  disabled={verifyCacMutation.isPending || !cacNumber}
                  className="w-full gap-2"
                >
                  {verifyCacMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                  Verify CAC
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tax Verification</CardTitle>
                <CardDescription>Verify taxpayer registration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Enter TIN" value={tinNumber} onChange={(e) => setTinNumber(e.target.value)} />
                <Button
                  onClick={() => verifyTinMutation.mutate({ tin: tinNumber })}
                  disabled={verifyTinMutation.isPending || !tinNumber}
                  className="w-full gap-2"
                >
                  {verifyTinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Verify TIN
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Integration Status</CardTitle>
              <CardDescription>
                Connected government systems and their current operational status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.integrations.map((integration) => {
                  const Icon = iconMap[integration.icon as keyof typeof iconMap] ?? Shield;
                  return (
                    <div key={integration.id} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-sm">{integration.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1">{integration.description}</p>
                          </div>
                        </div>
                        <Badge variant={integration.status === "active" ? "default" : "secondary"} className="text-xs">
                          {integration.status}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Endpoint:</span>
                          <code className="text-xs bg-muted px-1 rounded">{integration.endpoint}</code>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Last Sync:</span>
                          <span>{new Date(integration.lastSync).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Verifications</CardTitle>
              <CardDescription>
                Latest verification requests across government integration systems
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Type</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Identifier</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentVerifications.map((verification) => (
                      <tr key={verification.id} className="border-t hover:bg-muted/50">
                        <td className="px-4 py-3 text-sm">{verification.type}</td>
                        <td className="px-4 py-3 text-sm font-mono">{verification.identifier}</td>
                        <td className="px-4 py-3 text-sm">{verification.name}</td>
                        <td className="px-4 py-3">
                          {verification.status === "verified" ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Failed
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(verification.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
