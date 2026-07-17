import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Save,
  History,
  Bell,
  Lock,
  Bookmark,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function UserProfile() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: accountSettings, isLoading: accountLoading } = trpc.accountSettings.get.useQuery();
  const { data: preferences, isLoading: preferencesLoading } = trpc.preferences.get.useQuery();
  const { data: transactionsData, isLoading: transactionsLoading } = trpc.transactions.getMyTransactions.useQuery();
  const { data: savedSearchesData, isLoading: searchesLoading } = trpc.savedSearches.list.useQuery();

  const updateProfile = trpc.accountSettings.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.accountSettings.get.invalidate();
      toast.success("Profile updated successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update profile");
    },
  });

  const updatePreferences = trpc.preferences.update.useMutation({
    onSuccess: async () => {
      await utils.preferences.get.invalidate();
      toast.success("Notification preferences saved");
    },
    onError: () => {
      toast.error("Failed to save notification preferences");
    },
  });

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [pushNotifications, setPushNotifications] = useState(true);

  useEffect(() => {
    if (accountSettings?.profile) {
      setName(accountSettings.profile.name || "");
      setEmail(accountSettings.profile.email || "");
      setPhone(accountSettings.profile.phone || "");
    }
  }, [accountSettings?.profile]);

  useEffect(() => {
    if (preferences?.notificationSettings) {
      setEmailNotifications(preferences.notificationSettings.email ?? true);
      setSmsNotifications(preferences.notificationSettings.sms ?? false);
      setPushNotifications(preferences.notificationSettings.push ?? true);
    }
  }, [preferences?.notificationSettings]);

  const handleSaveProfile = () => {
    if (!name || !email || !phone) {
      toast.error("Please complete your name, email, and phone number");
      return;
    }

    updateProfile.mutate({ name, email, phone });
  };

  const handleSaveNotifications = () => {
    updatePreferences.mutate({
      notificationSettings: {
        email: emailNotifications,
        sms: smsNotifications,
        push: pushNotifications,
      },
    });
  };

  const transactions = Array.isArray((transactionsData as any)?.data)
    ? (transactionsData as any).data
    : Array.isArray(transactionsData)
      ? transactionsData
      : [];
  const savedSearches = Array.isArray(savedSearchesData) ? savedSearchesData : [];

  if (accountLoading || preferencesLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading profile...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              ← Back to Home
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">My Profile</h1>
          <div className="w-24"></div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">User Profile</h1>
            <p className="text-muted-foreground">Manage your account information and preferences</p>
          </div>

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="saved">Saved Searches</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personal Information
                  </CardTitle>
                  <CardDescription>Update your personal details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="pl-10" />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="email">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 XXX XXX XXXX" className="pl-10" />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="address">Address</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter your address" className="pl-10" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Account Type</p>
                        <p className="text-sm text-muted-foreground capitalize">{user?.role}</p>
                      </div>
                      <Badge variant="outline">{user?.loginMethod}</Badge>
                    </div>
                  </div>

                  <Button onClick={handleSaveProfile} className="gap-2" disabled={updateProfile.isPending}>
                    <Save className="h-4 w-4" />
                    {updateProfile.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    Security
                  </CardTitle>
                  <CardDescription>Manage your password and security settings</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/settings">
                    <Button variant="outline">Open Security Settings</Button>
                  </Link>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Transaction History
                  </CardTitle>
                  <CardDescription>View all your past transactions</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Parcel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactionsLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center">Loading...</TableCell>
                        </TableRow>
                      ) : transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">No transactions yet</TableCell>
                        </TableRow>
                      ) : transactions.map((tx: any) => (
                        <TableRow key={tx.id}>
                          <TableCell>{tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : 'N/A'}</TableCell>
                          <TableCell>{tx.type}</TableCell>
                          <TableCell className="font-mono text-sm">{tx.parcelId || tx.parcelNumber || 'N/A'}</TableCell>
                          <TableCell>
                            <Badge variant={tx.status === 'completed' ? 'default' : 'secondary'}>{tx.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <Link href={`/transactions/${tx.id}`}>
                              <Button variant="ghost" size="sm">View</Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="saved">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bookmark className="h-5 w-5" />
                    Saved Searches
                  </CardTitle>
                  <CardDescription>Quick access to your frequently used search criteria</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {searchesLoading ? (
                      <div className="text-center py-8">Loading...</div>
                    ) : savedSearches.length > 0 ? (
                      savedSearches.map((search: any) => (
                        <Card key={search.id}>
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-base">{search.name}</CardTitle>
                                <CardDescription className="text-sm mt-1">{search.criteria}</CardDescription>
                              </div>
                              <Button variant="outline" size="sm">Run Search</Button>
                            </div>
                          </CardHeader>
                        </Card>
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <Bookmark className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">No saved searches yet</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>Choose how you want to receive notifications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="email-notifications">Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                    </div>
                    <Switch id="email-notifications" checked={emailNotifications} onCheckedChange={setEmailNotifications} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="sms-notifications">SMS Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive notifications via SMS</p>
                    </div>
                    <Switch id="sms-notifications" checked={smsNotifications} onCheckedChange={setSmsNotifications} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="push-notifications">Push Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive browser push notifications</p>
                    </div>
                    <Switch id="push-notifications" checked={pushNotifications} onCheckedChange={setPushNotifications} />
                  </div>

                  <div className="pt-4 border-t">
                    <Button onClick={handleSaveNotifications} className="gap-2" disabled={updatePreferences.isPending}>
                      <Save className="h-4 w-4" />
                      {updatePreferences.isPending ? "Saving..." : "Save Preferences"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
