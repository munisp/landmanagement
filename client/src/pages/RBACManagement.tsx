import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { Shield, Users, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const PERMISSION_CATEGORIES = [
  {
    category: "Parcels",
    permissions: [
      { id: "parcels.view", name: "View Parcels", roles: ["user", "surveyor", "registrar", "admin"] as Role[] },
      { id: "parcels.edit", name: "Edit Parcels", roles: ["surveyor", "registrar", "admin"] as Role[] },
      { id: "parcels.create", name: "Create Parcels", roles: ["surveyor", "registrar", "admin"] as Role[] },
    ],
  },
  {
    category: "Transactions",
    permissions: [
      { id: "transactions.view", name: "View Transactions", roles: ["user", "registrar", "admin"] as Role[] },
      { id: "transactions.create", name: "Create Transactions", roles: ["user", "admin"] as Role[] },
      { id: "transactions.approve", name: "Approve Transactions", roles: ["registrar", "admin"] as Role[] },
    ],
  },
  {
    category: "Documents",
    permissions: [
      { id: "documents.upload", name: "Upload Documents", roles: ["user", "surveyor", "admin"] as Role[] },
      { id: "documents.verify", name: "Verify Documents", roles: ["registrar", "admin"] as Role[] },
      { id: "documents.view", name: "View Documents", roles: ["user", "surveyor", "registrar", "admin"] as Role[] },
    ],
  },
  {
    category: "Administration",
    permissions: [
      { id: "users.edit", name: "Edit Users", roles: ["admin"] as Role[] },
      { id: "users.suspend", name: "Suspend Users", roles: ["admin"] as Role[] },
      { id: "reports.export", name: "Export Reports", roles: ["admin", "registrar"] as Role[] },
    ],
  },
] as const;

type Role = "user" | "surveyor" | "registrar" | "admin";

const ROLE_LABELS: Record<Role, string> = {
  user: "Citizen",
  surveyor: "Surveyor",
  registrar: "Registrar",
  admin: "Administrator",
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  user: "Property owners and general public using the platform's service workflows.",
  surveyor: "Licensed surveyors who submit survey data and contribute parcel evidence.",
  registrar: "Registry officials responsible for reviewing records and approving transactions.",
  admin: "Full system administrators responsible for governance, access control, and oversight.",
};

export default function RBACManagement() {
  const utils = trpc.useUtils();
  const [selectedRole, setSelectedRole] = useState<Role>("admin");

  const usersQuery = trpc.admin.listUsers.useQuery({ page: 1, limit: 200 });
  const statsQuery = trpc.admin.getUserStats.useQuery();
  const activityQuery = trpc.admin.getUserActivity.useQuery({ limit: 20 });

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: async () => {
      toast.success("User role updated successfully");
      await Promise.all([
        utils.admin.listUsers.invalidate(),
        utils.admin.getUserStats.invalidate(),
        utils.admin.getUserActivity.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const suspendUserMutation = trpc.admin.suspendUser.useMutation({
    onSuccess: async () => {
      toast.success("User suspended successfully");
      await Promise.all([
        utils.admin.listUsers.invalidate(),
        utils.admin.getUserStats.invalidate(),
        utils.admin.getUserActivity.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const activateUserMutation = trpc.admin.activateUser.useMutation({
    onSuccess: async () => {
      toast.success("User reactivated successfully");
      await Promise.all([
        utils.admin.listUsers.invalidate(),
        utils.admin.getUserStats.invalidate(),
        utils.admin.getUserActivity.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const roleSummaries = useMemo(() => {
    const byRole = statsQuery.data?.byRole ?? {};
    const users = usersQuery.data?.users ?? [];
    return (["admin", "registrar", "surveyor", "user"] as Role[]).map((role) => ({
      id: role,
      name: ROLE_LABELS[role],
      description: ROLE_DESCRIPTIONS[role],
      userCount: Number(byRole[role] ?? 0),
      isSystem: true,
      members: users.filter((user) => user.role === role),
      permissions: PERMISSION_CATEGORIES.flatMap((category) =>
        category.permissions.filter((permission) => permission.roles.includes(role)).map((permission) => permission.id)
      ),
    }));
  }, [statsQuery.data, usersQuery.data]);

  const selectedRoleSummary = roleSummaries.find((role) => role.id === selectedRole) ?? roleSummaries[0];

  const isLoading = usersQuery.isLoading || statsQuery.isLoading || activityQuery.isLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading role and access controls...
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
          <h1 className="text-xl font-semibold">Role-Based Access Control</h1>
          <Button className="gap-2" onClick={() => toast.info("Role creation has been consolidated into the live admin role-assignment workflow") }>
            <Shield className="h-4 w-4" />
            Review Assignments
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
              <Shield className="h-10 w-10" />
              Role-Based Access Control
            </h1>
            <p className="text-lg text-muted-foreground">
              Manage live user-role assignments, visibility rules, and administrative audit activity across the platform.
            </p>
          </div>

          <Tabs defaultValue="roles" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="roles">Roles</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
              <TabsTrigger value="audit">Audit Log</TabsTrigger>
            </TabsList>

            <TabsContent value="roles">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        System Roles
                      </CardTitle>
                      <CardDescription>
                        {roleSummaries.length} live roles derived from current user assignments
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {roleSummaries.map((role) => (
                          <div
                            key={role.id}
                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedRole === role.id ? "bg-primary/5 border-primary" : "hover:bg-muted"}`}
                            onClick={() => setSelectedRole(role.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="font-semibold text-sm">{role.name}</p>
                                <p className="text-xs text-muted-foreground mt-1">{role.userCount.toLocaleString()} users</p>
                              </div>
                              <Badge variant="secondary" className="text-xs">System</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="lg:col-span-2">
                  {selectedRoleSummary ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>{selectedRoleSummary.name}</CardTitle>
                        <CardDescription>{selectedRoleSummary.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Total Users</p>
                            <p className="text-2xl font-bold">{selectedRoleSummary.userCount.toLocaleString()}</p>
                          </div>
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Permissions</p>
                            <p className="text-2xl font-bold">{selectedRoleSummary.permissions.length}</p>
                          </div>
                          <div className="p-4 border rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Suspended Users</p>
                            <p className="text-2xl font-bold">{selectedRoleSummary.members.filter((user) => user.suspended).length}</p>
                          </div>
                        </div>

                        <div>
                          <h3 className="font-semibold mb-3">Assigned Permissions</h3>
                          <div className="space-y-2">
                            {selectedRoleSummary.permissions.map((perm) => (
                              <div key={perm} className="flex items-center justify-between p-2 border rounded">
                                <span className="text-sm font-mono">{perm}</span>
                                <Badge variant="outline">Active</Badge>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h3 className="font-semibold mb-3">Role Members</h3>
                          <div className="space-y-3">
                            {selectedRoleSummary.members.slice(0, 12).map((user) => (
                              <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg gap-4">
                                <div>
                                  <p className="font-medium text-sm">{user.name || user.email || `User ${user.id}`}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {user.email || "No email"} • Last active {new Date(user.lastActive).toLocaleString()}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={user.role}
                                    onValueChange={(value: Role) => updateRoleMutation.mutate({ userId: user.id, newRole: value })}
                                  >
                                    <SelectTrigger className="w-[160px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="user">Citizen</SelectItem>
                                      <SelectItem value="surveyor">Surveyor</SelectItem>
                                      <SelectItem value="registrar">Registrar</SelectItem>
                                      <SelectItem value="admin">Administrator</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {user.suspended ? (
                                    <Button size="sm" variant="outline" onClick={() => activateUserMutation.mutate({ userId: user.id })}>
                                      Reactivate
                                    </Button>
                                  ) : (
                                    <Button size="sm" variant="outline" onClick={() => suspendUserMutation.mutate({ userId: user.id, reason: `Suspended from RBAC dashboard for ${selectedRoleSummary.name} review` })}>
                                      Suspend
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {selectedRoleSummary.members.length === 0 ? (
                              <div className="p-6 border rounded-lg text-sm text-muted-foreground">
                                No users are currently assigned to this role.
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="flex items-center justify-center h-96">
                        <div className="text-center">
                          <Lock className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                          <p className="text-lg font-medium mb-2">No Role Selected</p>
                          <p className="text-sm text-muted-foreground">Select a role to review live assignments and access state.</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="permissions">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5" />
                    Permissions Matrix
                  </CardTitle>
                  <CardDescription>
                    Effective permission coverage by platform role
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {PERMISSION_CATEGORIES.map((category) => (
                      <div key={category.category} className="border rounded-lg p-4">
                        <h3 className="font-semibold mb-4">{category.category}</h3>
                        <div className="space-y-3">
                          {category.permissions.map((perm) => (
                            <div key={perm.id} className="p-3 border rounded-lg">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="font-medium">{perm.name}</p>
                                  <p className="text-xs text-muted-foreground font-mono mt-1">{perm.id}</p>
                                </div>
                                <div className="flex flex-wrap gap-2 justify-end">
                                  {perm.roles.map((role) => (
                                    <Badge key={role} variant="secondary">
                                      {ROLE_LABELS[role as Role]}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audit">
              <Card>
                <CardHeader>
                  <CardTitle>Permission Audit Log</CardTitle>
                  <CardDescription>
                    Recent live user activity records from the administrative audit stream
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(activityQuery.data ?? []).map((log, index) => (
                      <div key={`${log.action}-${log.timestamp}-${index}`} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold">{log.action}</p>
                            <p className="text-sm text-muted-foreground">
                              User: {log.userName || `User ${log.userId}`}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</p>
                        </div>
                        <p className="text-sm">{typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}</p>
                      </div>
                    ))}
                    {(activityQuery.data ?? []).length === 0 ? (
                      <div className="p-6 border rounded-lg text-sm text-muted-foreground">
                        No administrative activity records are currently available.
                      </div>
                    ) : null}
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
