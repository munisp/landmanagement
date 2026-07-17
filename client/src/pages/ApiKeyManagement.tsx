import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast as sonnerToast } from 'sonner';
import { Key, Copy, Trash2, RotateCw, Eye, EyeOff, AlertTriangle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

export default function ApiKeyManagement() {
  const { t } = useTranslation();
  const toast = (props: { title: string; description?: string; variant?: string }) => {
    if (props.variant === 'destructive') {
      sonnerToast.error(props.title, { description: props.description });
    } else {
      sonnerToast.success(props.title, { description: props.description });
    }
  };
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [keyName, setKeyName] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // Fetch API keys
  const { data: apiKeys, isLoading, refetch } = trpc.apiKeys.list.useQuery();
  
  // Fetch usage statistics
  const { data: usageStats } = trpc.apiKeys.getUsageStats.useQuery();

  // Mutations
  const createKeyMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data: any) => {
      setNewKeyValue(data.key);
      setShowNewKey(true);
      setKeyName('');
      refetch();
      toast({
        title: t('apiKeys.created'),
        description: t('apiKeys.createdDescription'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const revokeKeyMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      refetch();
      setShowConfirmDelete(false);
      setKeyToDelete(null);
      toast({
        title: t('apiKeys.revoked'),
        description: t('apiKeys.revokedDescription'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const rotateKeyMutation = trpc.apiKeys.rotate.useMutation({
    onSuccess: (data) => {
      setNewKeyValue(data.key);
      setShowNewKey(true);
      refetch();
      toast({
        title: t('apiKeys.rotated'),
        description: t('apiKeys.rotatedDescription'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateKey = () => {
    if (!keyName.trim()) {
      toast({
        title: t('common.error'),
        description: t('apiKeys.nameRequired'),
        variant: 'destructive',
      });
      return;
    }
    createKeyMutation.mutate({ name: keyName });
  };

  const handleRevokeKey = (keyId: string) => {
    setKeyToDelete(keyId);
    setShowConfirmDelete(true);
  };

  const confirmRevoke = () => {
    if (keyToDelete) {
      revokeKeyMutation.mutate({ keyId: keyToDelete });
    }
  };

  const handleRotateKey = (keyId: string) => {
    rotateKeyMutation.mutate({ keyId });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('common.copied'),
      description: t('apiKeys.copiedToClipboard'),
    });
  };

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) {
        newSet.delete(keyId);
      } else {
        newSet.add(keyId);
      }
      return newSet;
    });
  };

  const maskKey = (key: string) => {
    return `${key.substring(0, 8)}${'*'.repeat(32)}${key.substring(key.length - 8)}`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('apiKeys.title')}</h1>
        <p className="text-muted-foreground">{t('apiKeys.description')}</p>
      </div>

      {/* Usage Statistics */}
      {usageStats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('apiKeys.totalKeys')}</CardTitle>
              <Key className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usageStats.totalKeys}</div>
              <p className="text-xs text-muted-foreground">
                {usageStats.activeKeys} {t('apiKeys.active')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('apiKeys.requestsToday')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usageStats.requestsToday.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {usageStats.requestsThisMonth.toLocaleString()} {t('apiKeys.thisMonth')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('apiKeys.rateLimitStatus')}</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usageStats.rateLimitHits}</div>
              <p className="text-xs text-muted-foreground">{t('apiKeys.rateLimitHitsDescription')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('apiKeys.errorRate')}</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usageStats.errorRate.toFixed(2)}%</div>
              <p className="text-xs text-muted-foreground">{t('apiKeys.last24Hours')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create New API Key */}
      <Card>
        <CardHeader>
          <CardTitle>{t('apiKeys.createNew')}</CardTitle>
          <CardDescription>{t('apiKeys.createNewDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="keyName">{t('apiKeys.keyName')}</Label>
              <Input
                id="keyName"
                placeholder={t('apiKeys.keyNamePlaceholder')}
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                disabled={createKeyMutation.isPending}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleCreateKey}
                disabled={createKeyMutation.isPending || !keyName.trim()}
              >
                {createKeyMutation.isPending ? t('common.creating') : t('apiKeys.generateKey')}
              </Button>
            </div>
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t('apiKeys.securityWarning')}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* API Keys List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('apiKeys.yourKeys')}</CardTitle>
          <CardDescription>{t('apiKeys.yourKeysDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!apiKeys || apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('apiKeys.noKeys')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key: any) => (
                <Card key={key.id} className="border-2">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{key.name}</h3>
                          <Badge variant={key.isActive ? 'default' : 'secondary'}>
                            {key.isActive ? t('apiKeys.active') : t('apiKeys.revoked')}
                          </Badge>
                          {key.expiresAt && new Date(key.expiresAt) < new Date() && (
                            <Badge variant="destructive">{t('apiKeys.expired')}</Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 font-mono text-sm">
                          <code className="flex-1 bg-muted px-3 py-2 rounded">
                            {visibleKeys.has(key.id) ? key.key : maskKey(key.key)}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggleKeyVisibility(key.id)}
                          >
                            {visibleKeys.has(key.id) ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => copyToClipboard(key.key)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span>
                            {t('apiKeys.created')}: {format(new Date(key.createdAt), 'PPp')}
                          </span>
                          {key.lastUsedAt && (
                            <span>
                              {t('apiKeys.lastUsed')}: {format(new Date(key.lastUsedAt), 'PPp')}
                            </span>
                          )}
                          {key.expiresAt && (
                            <span>
                              {t('apiKeys.expires')}: {format(new Date(key.expiresAt), 'PPp')}
                            </span>
                          )}
                        </div>

                        <div className="flex gap-4 text-sm">
                          <span>
                            {t('apiKeys.requestCount')}: <strong>{key.requestCount.toLocaleString()}</strong>
                          </span>
                          <span>
                            {t('apiKeys.rateLimit')}: <strong>{key.rateLimit}</strong> {t('apiKeys.perHour')}
                          </span>
                        </div>
                      </div>

                      {key.isActive && (
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRotateKey(key.id)}
                            disabled={rotateKeyMutation.isPending}
                          >
                            <RotateCw className="h-4 w-4 mr-2" />
                            {t('apiKeys.rotate')}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRevokeKey(key.id)}
                            disabled={revokeKeyMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('apiKeys.revoke')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Key Dialog */}
      <Dialog open={showNewKey} onOpenChange={setShowNewKey}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              {t('apiKeys.keyCreated')}
            </DialogTitle>
            <DialogDescription>{t('apiKeys.keyCreatedDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t('apiKeys.copyWarning')}</AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>{t('apiKeys.yourNewKey')}</Label>
              <div className="flex gap-2">
                <Input value={newKeyValue} readOnly className="font-mono" />
                <Button onClick={() => copyToClipboard(newKeyValue)}>
                  <Copy className="h-4 w-4 mr-2" />
                  {t('common.copy')}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowNewKey(false)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={showConfirmDelete} onOpenChange={setShowConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('apiKeys.confirmRevoke')}</DialogTitle>
            <DialogDescription>{t('apiKeys.confirmRevokeDescription')}</DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRevoke}
              disabled={revokeKeyMutation.isPending}
            >
              {revokeKeyMutation.isPending ? t('common.revoking') : t('apiKeys.revoke')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
