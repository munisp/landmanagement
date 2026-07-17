/**
 * Settings Page
 * Comprehensive user settings with Profile, Preferences, Notifications, and Security
 */

import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Settings as SettingsIcon, Bell, Shield } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

type ProfileFormState = {
  name: string;
  email: string;
  phone: string;
};

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export default function Settings() {
  const utils = trpc.useUtils();
  const { data: preferences, isLoading: preferencesLoading } = trpc.preferences.get.useQuery();
  const { data: accountSettings, isLoading: accountLoading } = trpc.accountSettings.get.useQuery();

  const updatePreferences = trpc.preferences.update.useMutation({
    onSuccess: async () => {
      await utils.preferences.get.invalidate();
      toast.success('Preferences updated successfully');
    },
    onError: () => {
      toast.error('Failed to update preferences');
    },
  });

  const updateProfile = trpc.accountSettings.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.accountSettings.get.invalidate();
      toast.success('Profile updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update profile');
    },
  });

  const changePassword = trpc.accountSettings.changePassword.useMutation({
    onSuccess: async () => {
      await utils.accountSettings.get.invalidate();
      toast.success('Password updated successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update password');
    },
  });

  const setTwoFactorEnabled = trpc.accountSettings.setTwoFactorEnabled.useMutation({
    onSuccess: async (_, variables) => {
      await utils.accountSettings.get.invalidate();
      toast.success(variables.enabled ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update two-factor authentication');
    },
  });

  const revokeSession = trpc.accountSettings.revokeSession.useMutation({
    onSuccess: async () => {
      await utils.accountSettings.get.invalidate();
      toast.success('Session revoked successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to revoke session');
    },
  });

  const [profile, setProfile] = useState<ProfileFormState>({
    name: '',
    email: '',
    phone: '',
  });

  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (accountSettings?.profile) {
      setProfile({
        name: accountSettings.profile.name || '',
        email: accountSettings.profile.email || '',
        phone: accountSettings.profile.phone || '',
      });
    }
  }, [accountSettings?.profile]);

  const isLoading = preferencesLoading || accountLoading;

  const securitySummary = useMemo(() => {
    if (!accountSettings?.security) {
      return {
        twoFactorEnabled: false,
        passwordUpdatedAt: 'Unavailable',
      };
    }

    return {
      twoFactorEnabled: accountSettings.security.twoFactorEnabled,
      passwordUpdatedAt: new Date(accountSettings.security.passwordUpdatedAt).toLocaleString(),
    };
  }, [accountSettings?.security]);

  const handleUpdatePreferences = async (updates: {
    theme?: 'light' | 'dark' | 'system';
    language?: string;
    timezone?: string;
    dateFormat?: string;
    currency?: string;
    notificationSettings?: {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
      transactionUpdates?: boolean;
      systemAlerts?: boolean;
    };
  }) => {
    await updatePreferences.mutateAsync(updates);
  };

  const handleSaveProfile = async () => {
    if (!profile.name.trim() || !profile.email.trim() || !profile.phone.trim()) {
      toast.error('Please complete all profile fields');
      return;
    }

    await updateProfile.mutateAsync({
      name: profile.name.trim(),
      email: profile.email.trim(),
      phone: profile.phone.trim(),
    });
  };

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('Please complete all password fields');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New password and confirmation do not match');
      return;
    }

    await changePassword.mutateAsync({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-96 rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="preferences">
            <SettingsIcon className="mr-2 h-4 w-4" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="mr-2 h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information and profile details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={profile.name}
                  onChange={(e) => setProfile((current) => ({ ...current, name: e.target.value }))}
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile((current) => ({ ...current, email: e.target.value }))}
                  placeholder="john@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile((current) => ({ ...current, phone: e.target.value }))}
                  placeholder="+234 XXX XXX XXXX"
                />
              </div>

              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Current Role</p>
                <p className="text-sm text-muted-foreground">
                  {accountSettings?.profile?.role || 'user'}
                </p>
              </div>

              <Button onClick={handleSaveProfile} disabled={updateProfile.isPending}>
                {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
              <CardDescription>
                Customize your experience with theme, language, and regional settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="theme">Theme</Label>
                <Select
                  value={preferences?.theme || 'system'}
                  onValueChange={(value: 'light' | 'dark' | 'system') =>
                    handleUpdatePreferences({ theme: value })
                  }
                >
                  <SelectTrigger id="theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select
                  value={preferences?.language || 'en'}
                  onValueChange={(value) => handleUpdatePreferences({ language: value })}
                >
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ha">Hausa</SelectItem>
                    <SelectItem value="yo">Yoruba</SelectItem>
                    <SelectItem value="ig">Igbo</SelectItem>
                    <SelectItem value="pcm">Nigerian Pidgin</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                    <SelectItem value="sw">Swahili</SelectItem>
                    <SelectItem value="am">Amharic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={preferences?.timezone || 'Africa/Lagos'}
                  onValueChange={(value) => handleUpdatePreferences({ timezone: value })}
                >
                  <SelectTrigger id="timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Africa/Lagos">Lagos (WAT)</SelectItem>
                    <SelectItem value="Africa/Nairobi">Nairobi (EAT)</SelectItem>
                    <SelectItem value="Africa/Cairo">Cairo (EET)</SelectItem>
                    <SelectItem value="Africa/Johannesburg">Johannesburg (SAST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateFormat">Date Format</Label>
                <Select
                  value={preferences?.dateFormat || 'DD/MM/YYYY'}
                  onValueChange={(value) => handleUpdatePreferences({ dateFormat: value })}
                >
                  <SelectTrigger id="dateFormat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={preferences?.currency || 'NGN'}
                  onValueChange={(value) => handleUpdatePreferences({ currency: value })}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">Nigerian Naira (₦)</SelectItem>
                    <SelectItem value="USD">US Dollar ($)</SelectItem>
                    <SelectItem value="EUR">Euro (€)</SelectItem>
                    <SelectItem value="GBP">British Pound (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose how you want to be notified about updates and activities.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                {
                  id: 'email-notifications',
                  label: 'Email Notifications',
                  description: 'Receive notifications via email',
                  checked: preferences?.notificationSettings?.email ?? true,
                  payload: { email: true },
                  field: 'email' as const,
                },
                {
                  id: 'sms-notifications',
                  label: 'SMS Notifications',
                  description: 'Receive notifications via SMS',
                  checked: preferences?.notificationSettings?.sms ?? true,
                  payload: { sms: true },
                  field: 'sms' as const,
                },
                {
                  id: 'push-notifications',
                  label: 'Push Notifications',
                  description: 'Receive push notifications in your browser',
                  checked: preferences?.notificationSettings?.push ?? true,
                  payload: { push: true },
                  field: 'push' as const,
                },
                {
                  id: 'transaction-updates',
                  label: 'Transaction Updates',
                  description: 'Get notified about transaction status changes',
                  checked: preferences?.notificationSettings?.transactionUpdates ?? true,
                  payload: { transactionUpdates: true },
                  field: 'transactionUpdates' as const,
                },
                {
                  id: 'system-alerts',
                  label: 'System Alerts',
                  description: 'Receive important system alerts and announcements',
                  checked: preferences?.notificationSettings?.systemAlerts ?? true,
                  payload: { systemAlerts: true },
                  field: 'systemAlerts' as const,
                },
              ].map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor={item.id}>{item.label}</Label>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={(checked) =>
                      handleUpdatePreferences({
                        notificationSettings: { [item.field]: checked },
                      })
                    }
                    disabled={updatePreferences.isPending}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                  Change your password to keep your account secure.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Last updated: {securitySummary.passwordUpdatedAt}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm((current) => ({ ...current, currentPassword: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm((current) => ({ ...current, newPassword: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm((current) => ({ ...current, confirmPassword: e.target.value }))
                    }
                  />
                </div>

                <Button onClick={handleChangePassword} disabled={changePassword.isPending}>
                  {changePassword.isPending ? 'Updating...' : 'Update Password'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Two-factor authentication</p>
                    <p className="text-sm text-muted-foreground">
                      Require an additional verification step during sign-in.
                    </p>
                  </div>
                  <Switch
                    checked={securitySummary.twoFactorEnabled}
                    onCheckedChange={(checked) => setTwoFactorEnabled.mutate({ enabled: checked })}
                    disabled={setTwoFactorEnabled.isPending}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>
                  Manage your active sessions across different devices.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {accountSettings?.sessions?.length ? (
                  accountSettings.sessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">
                          {session.device}
                          {session.isCurrent ? ' • Current Session' : ''}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {session.location} • Last active {new Date(session.lastActiveAt).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={session.isCurrent || revokeSession.isPending}
                        onClick={() => revokeSession.mutate({ sessionId: session.id })}
                      >
                        Revoke
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                    No active sessions found.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
