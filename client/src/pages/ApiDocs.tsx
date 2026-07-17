import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'wouter';
import {
  Code,
  Key,
  Book,
  Copy,
  CheckCircle2,
  ExternalLink,
  Shield,
  BarChart3,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';

export default function ApiDocs() {
  const utils = trpc.useUtils();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('Production Integration');

  const { data: currentUser } = trpc.auth.me.useQuery();
  const isAuthenticated = Boolean(currentUser?.id);

  const { data: apiKeys = [], isLoading: keysLoading } = trpc.apiKeys.list.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: usageStats } = trpc.apiKeys.getUsageStats.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: false,
  });

  const createApiKey = trpc.apiKeys.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.apiKeys.list.invalidate(),
        utils.apiKeys.getUsageStats.invalidate(),
      ]);
      toast.success('API key created successfully');
      setNewKeyName('Production Integration');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create API key');
    },
  });

  const revokeApiKey = trpc.apiKeys.revoke.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.apiKeys.list.invalidate(),
        utils.apiKeys.getUsageStats.invalidate(),
      ]);
      toast.success('API key revoked successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to revoke API key');
    },
  });

  const rotateApiKey = trpc.apiKeys.rotate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.apiKeys.list.invalidate(),
        utils.apiKeys.getUsageStats.invalidate(),
      ]);
      toast.success('API key rotated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to rotate API key');
    },
  });

  const primaryKey = apiKeys.find((key) => key.isActive) || apiKeys[0];
  const exampleKey = primaryKey?.key || 'your_api_key_here';

  const codeExamples = useMemo(
    () => ({
      curl: `curl -X GET "https://api.idlr-pts.gov.ng/v1/parcels?state=Lagos&limit=10" \\
  -H "X-API-Key: ${exampleKey}"`,
      javascript: `const response = await fetch('https://api.idlr-pts.gov.ng/v1/parcels?state=Lagos&limit=10', {
  headers: {
    'X-API-Key': '${exampleKey}'
  }
});
const data = await response.json();
console.log(data);`,
      python: `import requests

url = "https://api.idlr-pts.gov.ng/v1/parcels"
headers = {"X-API-Key": "${exampleKey}"}
params = {"state": "Lagos", "limit": 10}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data)`,
      go: `package main

import (
    "fmt"
    "io/ioutil"
    "net/http"
)

func main() {
    url := "https://api.idlr-pts.gov.ng/v1/parcels?state=Lagos&limit=10"

    req, _ := http.NewRequest("GET", url, nil)
    req.Header.Add("X-API-Key", "${exampleKey}")

    res, _ := http.DefaultClient.Do(req)
    defer res.Body.Close()

    body, _ := ioutil.ReadAll(res.Body)
    fmt.Println(string(body))
}`,
    }),
    [exampleKey]
  );

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const maskedKey = (value: string) => {
    if (value.length <= 12) return value;
    return `${value.slice(0, 8)}••••${value.slice(-6)}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              ← Back to Home
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">API Documentation</h1>
          <div className="w-24" />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="mb-4 text-4xl font-bold">IDLR-PTS Public API</h1>
              <p className="mb-6 max-w-3xl text-lg text-muted-foreground">
                Integrate land registry data into your applications with a documented API surface for
                parcels, transactions, titles, and verification workflows.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="gap-2"
                  onClick={() => {
                    if (!isAuthenticated) {
                      toast.error('Sign in to create and manage API keys');
                      return;
                    }
                    createApiKey.mutate({ name: newKeyName.trim() || 'Production Integration' });
                  }}
                  disabled={createApiKey.isPending}
                >
                  <Key className="h-4 w-4" />
                  {createApiKey.isPending ? 'Creating Key...' : 'Create API Key'}
                </Button>
                <Button variant="outline" className="gap-2" asChild>
                  <a href="/api-docs/openapi.json" target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    OpenAPI Spec
                  </a>
                </Button>
              </div>
            </div>

            <Card className="w-full lg:max-w-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="h-4 w-4" />
                  Integration Access
                </CardTitle>
                <CardDescription>
                  {isAuthenticated
                    ? 'Manage your API keys and usage for external integrations.'
                    : 'Sign in to create API keys and monitor usage for your integrations.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-key-name">New API Key Name</Label>
                  <Input
                    id="api-key-name"
                    value={newKeyName}
                    onChange={(event) => setNewKeyName(event.target.value)}
                    placeholder="Production Integration"
                    disabled={!isAuthenticated || createApiKey.isPending}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">Active Keys</p>
                    <p className="text-2xl font-semibold">{usageStats?.activeKeys ?? 0}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">Requests Today</p>
                    <p className="text-2xl font-semibold">{usageStats?.requestsToday ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                API Key Management
              </CardTitle>
              <CardDescription>
                View active keys, rotate compromised keys, and monitor current usage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAuthenticated ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Sign in to create and manage API keys for your organization.
                </div>
              ) : keysLoading ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Loading API keys...
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  No API keys yet. Create your first key to begin integrating with the platform.
                </div>
              ) : (
                <div className="space-y-3">
                  {apiKeys.map((key) => (
                    <div key={key.id} className="flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{key.name}</p>
                          <Badge variant={key.isActive ? 'default' : 'secondary'}>
                            {key.isActive ? 'Active' : 'Revoked'}
                          </Badge>
                        </div>
                        <p className="font-mono text-sm text-muted-foreground">{maskedKey(key.key)}</p>
                        <p className="text-sm text-muted-foreground">
                          Created {new Date(key.createdAt).toLocaleString()} • Last used{' '}
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'} • Rate limit {key.rateLimit}/hr
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => rotateApiKey.mutate({ keyId: key.id })}
                          disabled={!key.isActive || rotateApiKey.isPending}
                        >
                          <RefreshCcw className="h-4 w-4" />
                          Rotate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => revokeApiKey.mutate({ keyId: key.id })}
                          disabled={!key.isActive || revokeApiKey.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                          Revoke
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(key.key, key.id)}
                        >
                          {copiedCode === key.id ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Book className="h-5 w-5" />
                Quick Start
              </CardTitle>
              <CardDescription>Get started with the IDLR-PTS API in minutes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="mb-2 font-semibold">1. Create or select an API key</h3>
                <p className="text-sm text-muted-foreground">
                  Use the key management panel above to create a dedicated key per integration environment.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">2. Make your first request</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  All API requests should be made to{' '}
                  <code className="rounded bg-muted px-2 py-1">https://api.idlr-pts.gov.ng/v1</code>.
                </p>

                <Tabs defaultValue="curl" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="curl">cURL</TabsTrigger>
                    <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                    <TabsTrigger value="python">Python</TabsTrigger>
                    <TabsTrigger value="go">Go</TabsTrigger>
                  </TabsList>
                  {Object.entries(codeExamples).map(([lang, code]) => (
                    <TabsContent key={lang} value={lang}>
                      <div className="relative">
                        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-50">
                          <code>{code}</code>
                        </pre>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-2"
                          onClick={() => copyToClipboard(code, lang)}
                        >
                          {copiedCode === lang ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">3. Handle the response</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  Responses are returned in JSON with data and pagination metadata.
                </p>
                <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">{`{
  "data": [
    {
      "id": 1,
      "parcelNumber": "LG-VI-2024-001",
      "state": "Lagos",
      "lga": "Victoria Island",
      "areaSquareMeters": 1200.5,
      "landUseType": "residential",
      "status": "verified"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 45678,
    "totalPages": 4568
  }
}`}</pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                API Endpoints
              </CardTitle>
              <CardDescription>Available endpoints and their usage.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {[
                  {
                    method: 'GET',
                    path: '/parcels',
                    description: 'Search for land parcels with optional filters by state, LGA, land use, and status.',
                  },
                  {
                    method: 'GET',
                    path: '/parcels/:id',
                    description: 'Get detailed information about a specific parcel.',
                  },
                  {
                    method: 'GET',
                    path: '/transactions',
                    description: 'List transactions with optional filters such as parcel, type, and status.',
                  },
                  {
                    method: 'POST',
                    path: '/transactions',
                    description: 'Initiate a new land transaction using an authenticated integration key.',
                  },
                  {
                    method: 'GET',
                    path: '/blockchain/verify/:txHash',
                    description: 'Verify a transaction recorded on the blockchain.',
                  },
                ].map((endpoint) => (
                  <div key={endpoint.path}>
                    <div className="mb-2 flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={endpoint.method === 'POST'
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-blue-200 bg-blue-50 text-blue-700'}
                      >
                        {endpoint.method}
                      </Badge>
                      <code className="text-sm">{endpoint.path}</code>
                    </div>
                    <p className="text-sm text-muted-foreground">{endpoint.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rate Limiting</CardTitle>
              <CardDescription>API usage limits and current integration telemetry.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>
                Standard API keys are provisioned with an hourly request limit and tracked usage counts.
              </p>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">Total Keys</p>
                  <p className="text-xl font-semibold">{usageStats?.totalKeys ?? 0}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">Requests Today</p>
                  <p className="text-xl font-semibold">{usageStats?.requestsToday ?? 0}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">Requests This Month</p>
                  <p className="text-xl font-semibold">{usageStats?.requestsThisMonth ?? 0}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground">Rate Limit Hits</p>
                  <p className="text-xl font-semibold">{usageStats?.rateLimitHits ?? 0}</p>
                </div>
              </div>
              <pre className="rounded bg-muted p-3 text-xs">{`X-RateLimit-Limit: ${primaryKey?.rateLimit ?? 1000}
X-RateLimit-Remaining: dynamic
X-RateLimit-Reset: unix_timestamp`}</pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
