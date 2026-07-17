import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  UserCog, 
  UserX, 
  UserCheck, 
  Shield, 
  Users, 
  Activity,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function AdminUserManagement() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState<'user' | 'surveyor' | 'registrar' | 'admin'>('user');
  const [suspensionReason, setSuspensionReason] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  
  // Fetch users
  const { data: usersData, isLoading } = trpc.admin.listUsers.useQuery({ page, limit: 50 });
  
  // Fetch user stats
  const { data: stats } = trpc.admin.getUserStats.useQuery();
  
  // Fetch activity logs for expanded user
  const { data: activityLogs } = trpc.admin.getUserActivity.useQuery(
    { userId: expandedUserId ?? undefined, limit: 10 },
    { enabled: expandedUserId !== null }
  );

  // Mutations
  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success(t('admin.userManagement.roleChanged'));
      utils.admin.listUsers.invalidate();
      utils.admin.getUserStats.invalidate();
      setRoleDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast.error(error.message || t('common.error'));
    },
  });

  const suspendUserMutation = trpc.admin.suspendUser.useMutation({
    onSuccess: () => {
      toast.success(t('admin.userManagement.userSuspended'));
      utils.admin.listUsers.invalidate();
      utils.admin.getUserStats.invalidate();
      setSuspendDialogOpen(false);
      setSelectedUser(null);
      setSuspensionReason('');
    },
    onError: (error) => {
      toast.error(error.message || t('common.error'));
    },
  });

  const activateUserMutation = trpc.admin.activateUser.useMutation({
    onSuccess: () => {
      toast.success(t('admin.userManagement.userActivated'));
      utils.admin.listUsers.invalidate();
      utils.admin.getUserStats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to activate user');
    },
  });

  const handleRoleChange = () => {
    if (selectedUser) {
      updateRoleMutation.mutate({ userId: selectedUser, newRole });
    }
  };

  const handleSuspend = () => {
    if (selectedUser && suspensionReason.trim()) {
      suspendUserMutation.mutate({ userId: selectedUser, reason: suspensionReason });
    } else {
      toast.error('Please provide a suspension reason');
    }
  };

  const handleActivate = (userId: number) => {
    activateUserMutation.mutate({ userId });
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'default';
      case 'registrar':
        return 'secondary';
      case 'surveyor':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const toggleExpandUser = (userId: number) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
    } else {
      setExpandedUserId(userId);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('admin.userManagement.title')}</h1>
          <p className="text-muted-foreground">{t('admin.userManagement.title')}</p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('admin.userManagement.totalUsers')}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('admin.userManagement.activeUsers')}</CardTitle>
              <UserCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('admin.userManagement.suspendedUsers')}</CardTitle>
              <UserX className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.suspended}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('admin.userManagement.adminUsers')}</CardTitle>
              <Shield className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byRole.admin || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.userManagement.userList')}</CardTitle>
          <CardDescription>
            {usersData && `Showing ${usersData.users.length} of ${usersData.total} users`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">{t('common.loading')}</div>
          ) : usersData && usersData.users.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>{t('admin.userManagement.name')}</TableHead>
                    <TableHead>{t('admin.userManagement.email')}</TableHead>
                    <TableHead>{t('admin.userManagement.role')}</TableHead>
                    <TableHead>{t('admin.userManagement.status')}</TableHead>
                    <TableHead>{t('admin.userManagement.lastActive')}</TableHead>
                    <TableHead className="text-right">{t('admin.userManagement.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersData.users.map((user) => (
                    <>
                      <TableRow key={user.id}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpandUser(user.id)}
                          >
                            {expandedUserId === user.id ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{user.name || 'N/A'}</TableCell>
                        <TableCell>{user.email || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant={getRoleBadgeVariant(user.role)}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.suspended ? (
                            <Badge variant="destructive">Suspended</Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(user.lastActive), 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user.id);
                              setNewRole(user.role);
                              setRoleDialogOpen(true);
                            }}
                          >
                            <UserCog className="h-4 w-4 mr-1" />
                            Change Role
                          </Button>
                          {user.suspended ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleActivate(user.id)}
                              disabled={activateUserMutation.isPending}
                            >
                              <UserCheck className="h-4 w-4 mr-1" />
                              Activate
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user.id);
                                setSuspendDialogOpen(true);
                              }}
                            >
                              <UserX className="h-4 w-4 mr-1" />
                              Suspend
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      
                      {/* Expandable Activity Row */}
                      {expandedUserId === user.id && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/50">
                            <div className="p-4 space-y-2">
                              <div className="flex items-center gap-2 mb-3">
                                <Activity className="h-4 w-4" />
                                <h4 className="font-semibold">Recent Activity</h4>
                              </div>
                              {activityLogs && activityLogs.length > 0 ? (
                                <div className="space-y-2">
                                  {activityLogs.map((log, idx) => (
                                    <div key={idx} className="flex items-start gap-3 text-sm">
                                      <span className="text-muted-foreground min-w-[140px]">
                                        {format(new Date(log.timestamp), 'MMM dd, HH:mm:ss')}
                                      </span>
                                      <span className="font-medium">{log.action}</span>
                                      <span className="text-muted-foreground">
                                        {JSON.stringify(log.details)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No recent activity</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No users found</div>
          )}

          {/* Pagination */}
          {usersData && usersData.total > usersData.limit && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {Math.ceil(usersData.total / usersData.limit)}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(usersData.total / usersData.limit)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change User Role</DialogTitle>
            <DialogDescription>
              Select a new role for this user. This will affect their permissions and access levels.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">New Role</label>
              <Select value={newRole} onValueChange={(value: any) => setNewRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="surveyor">Surveyor</SelectItem>
                  <SelectItem value="registrar">Registrar</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>User:</strong> Basic access to view parcels and transactions</p>
              <p><strong>Surveyor:</strong> Can create and verify survey data</p>
              <p><strong>Registrar:</strong> Can approve registrations and issue titles</p>
              <p><strong>Admin:</strong> Full system access including user management</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRoleChange}
              disabled={updateRoleMutation.isPending}
            >
              {updateRoleMutation.isPending ? 'Updating...' : 'Update Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend User Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend User Account</DialogTitle>
            <DialogDescription>
              This will prevent the user from accessing the system. Please provide a reason for suspension.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Suspension Reason</label>
              <Textarea
                placeholder="Enter the reason for suspending this account..."
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleSuspend}
              disabled={suspendUserMutation.isPending || !suspensionReason.trim()}
            >
              {suspendUserMutation.isPending ? 'Suspending...' : 'Suspend User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
