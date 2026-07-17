import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Download, Search, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";

type AuditRecord = {
  id: number;
  userId: number | null;
  type: string;
  description: string;
  metadata?: Record<string, any> | null;
  createdAt: string;
};

export default function AuditTrail() {
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");

  const filters = {
    startDate: undefined,
    endDate: undefined,
    type: actionFilter === "all" ? undefined : actionFilter,
  };

  const { data: exportPayload, isLoading } = trpc.audit.exportJSON.useQuery(filters);
  const { data: stats } = trpc.audit.getStats.useQuery({});

  const auditLogs: AuditRecord[] = useMemo(() => {
    if (!exportPayload?.json) return [];

    try {
      const parsed = JSON.parse(exportPayload.json);
      return Array.isArray(parsed.records) ? parsed.records : [];
    } catch {
      return [];
    }
  }, [exportPayload]);

  const filteredLogs = auditLogs.filter((log) => {
    const metadataText = JSON.stringify(log.metadata || {}).toLowerCase();
    const entityId = String(log.metadata?.entityId || log.metadata?.transactionId || log.metadata?.parcelId || "").toLowerCase();
    const entityType = String(log.metadata?.entityType || log.metadata?.resourceType || "unknown").toLowerCase();

    const matchesSearch =
      log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entityId.includes(searchTerm.toLowerCase()) ||
      metadataText.includes(searchTerm.toLowerCase()) ||
      String(log.userId || "").includes(searchTerm);

    const matchesAction = actionFilter === "all" || log.type === actionFilter;
    const matchesEntity = entityFilter === "all" || entityType === entityFilter;

    return matchesSearch && matchesAction && matchesEntity;
  });

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      CREATE: "bg-green-100 text-green-800 border-green-200",
      UPDATE: "bg-blue-100 text-blue-800 border-blue-200",
      DELETE: "bg-red-100 text-red-800 border-red-200",
      APPROVE: "bg-green-100 text-green-800 border-green-200",
      REJECT: "bg-red-100 text-red-800 border-red-200",
      LOGIN: "bg-gray-100 text-gray-800 border-gray-200",
      LOGOUT: "bg-gray-100 text-gray-800 border-gray-200",
    };

    return (
      <Badge variant="outline" className={colors[action] || "bg-slate-100 text-slate-800 border-slate-200"}>
        {action}
      </Badge>
    );
  };

  const exportToCSV = () => {
    const headers = ["ID", "Timestamp", "User ID", "Action", "Entity Type", "Entity ID", "Details"];
    const rows = filteredLogs.map((log) => {
      const metadata = log.metadata || {};
      return [
        log.id,
        format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss"),
        log.userId ?? "",
        log.type,
        metadata.entityType || metadata.resourceType || "unknown",
        metadata.entityId || metadata.transactionId || metadata.parcelId || "",
        log.description,
      ];
    });

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const totalEvents = filteredLogs.length;
  const actionCount = (action: string) => filteredLogs.filter((log) => log.type === action).length;
  const uniqueUsers = new Set(filteredLogs.map((log) => log.userId).filter(Boolean)).size;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/admin">
            <Button variant="ghost" className="gap-2">
              ← Back to Admin
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Audit Trail</h1>
          <div className="w-24"></div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>System Audit Log</CardTitle>
                <CardDescription>
                  Track persisted system activities and user actions from the live audit store.
                </CardDescription>
              </div>
              <Button onClick={exportToCSV} className="gap-2" disabled={filteredLogs.length === 0}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by action, entity ID, user, or details..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                  <SelectItem value="APPROVE">Approve</SelectItem>
                  <SelectItem value="REJECT">Reject</SelectItem>
                  <SelectItem value="LOGIN">Login</SelectItem>
                  <SelectItem value="LOGOUT">Logout</SelectItem>
                </SelectContent>
              </Select>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  <SelectItem value="parcel">Parcel</SelectItem>
                  <SelectItem value="transaction">Transaction</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10">
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading audit records...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No audit logs found for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log) => {
                      const metadata = log.metadata || {};
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">
                            {format(new Date(log.createdAt), "MMM dd, yyyy HH:mm:ss")}
                          </TableCell>
                          <TableCell className="font-medium">{log.userId ?? "System"}</TableCell>
                          <TableCell>{getActionBadge(log.type)}</TableCell>
                          <TableCell className="capitalize">{metadata.entityType || metadata.resourceType || "unknown"}</TableCell>
                          <TableCell className="font-mono text-sm">{metadata.entityId || metadata.transactionId || metadata.parcelId || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{log.description}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{totalEvents}</div>
                  <p className="text-xs text-muted-foreground">Visible Events</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-600">{actionCount("CREATE")}</div>
                  <p className="text-xs text-muted-foreground">Created</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-blue-600">{actionCount("UPDATE")}</div>
                  <p className="text-xs text-muted-foreground">Updated</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-600">{actionCount("DELETE")}</div>
                  <p className="text-xs text-muted-foreground">Deleted</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-purple-600">{uniqueUsers}</div>
                  <p className="text-xs text-muted-foreground">Unique Users</p>
                </CardContent>
              </Card>
            </div>

            {stats?.length ? (
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map((stat: any) => (
                  <div key={stat.type} className="rounded-lg border p-4">
                    <div className="text-sm text-muted-foreground">{stat.type}</div>
                    <div className="text-xl font-semibold">{stat.count}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
