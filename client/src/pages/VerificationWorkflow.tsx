import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { FileText, Upload, CheckCircle, XCircle, Clock, Eye, UserPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/_core/hooks/useAuth';
import { arrayBufferToBase64 } from '@/lib/storage';

type VerificationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';

// Status config moved inside component to access t()

export default function VerificationWorkflow() {
  const { t } = useTranslation();
  const { user } = useAuth();
  
  const statusConfig: Record<VerificationStatus, { label: string; color: string; icon: React.ReactNode }> = {
    draft: { label: t('admin.verification.statusDraft'), color: 'bg-gray-500', icon: <FileText className="w-4 h-4" /> },
    submitted: { label: t('admin.verification.statusSubmitted'), color: 'bg-blue-500', icon: <Clock className="w-4 h-4" /> },
    under_review: { label: t('admin.verification.statusUnderReview'), color: 'bg-yellow-500', icon: <Eye className="w-4 h-4" /> },
    approved: { label: t('admin.verification.statusApproved'), color: 'bg-green-500', icon: <CheckCircle className="w-4 h-4" /> },
    rejected: { label: t('admin.verification.statusRejected'), color: 'bg-red-500', icon: <XCircle className="w-4 h-4" /> },
  };
  
  const [selectedStatus, setSelectedStatus] = useState<VerificationStatus | 'all'>('all');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<number | null>(null);
  
  // Form states
  const [parcelId, setParcelId] = useState('');
  const [notes, setNotes] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [documentType, setDocumentType] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'registrar';

  // Queries
  const { data: requests, refetch } = trpc.verification.list.useQuery({
    status: selectedStatus === 'all' ? undefined : selectedStatus,
    page: 1,
    limit: 50,
  });

  const { data: requestDetails } = trpc.verification.getDetails.useQuery(
    { requestId: expandedRow! },
    { enabled: expandedRow !== null }
  );

  const { data: history } = trpc.verification.getHistory.useQuery(
    { requestId: expandedRow! },
    { enabled: expandedRow !== null }
  );

  // Mutations
  const createMutation = trpc.verification.create.useMutation({
    onSuccess: () => {
      toast.success('Verification request created');
      setCreateDialogOpen(false);
      setParcelId('');
      setNotes('');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const submitMutation = trpc.verification.submit.useMutation({
    onSuccess: () => {
      toast.success('Verification request submitted for review');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const assignMutation = trpc.verification.assignReviewer.useMutation({
    onSuccess: () => {
      toast.success('Reviewer assigned successfully');
      setAssignDialogOpen(false);
      setReviewerId('');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const approveMutation = trpc.verification.approve.useMutation({
    onSuccess: () => {
      toast.success('Verification request approved');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const rejectMutation = trpc.verification.reject.useMutation({
    onSuccess: () => {
      toast.success('Verification request rejected');
      setRejectDialogOpen(false);
      setRejectionReason('');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const addDocumentMutation = trpc.verification.addDocument.useMutation({
    onSuccess: () => {
      toast.success('Document uploaded successfully');
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setDocumentType('');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const uploadMutation = trpc.storage.upload.useMutation();

  const handleFileUpload = async () => {
    if (!selectedFile || !selectedRequest || !documentType) {
      toast.error('Please select a file and document type');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploadingFile(true);
    try {
      const fileBuffer = await selectedFile.arrayBuffer();
      const base64Data = arrayBufferToBase64(fileBuffer);
      const key = `verification/${selectedRequest}/${Date.now()}-${selectedFile.name}`;
      
      const { url } = await uploadMutation.mutateAsync({
        key,
        data: base64Data,
        contentType: selectedFile.type,
      });

      await addDocumentMutation.mutateAsync({
        requestId: selectedRequest,
        documentType,
        fileName: selectedFile.name,
        fileUrl: url,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type,
      });
    } catch (error) {
      toast.error('Failed to upload document');
      console.error(error);
    } finally {
      setUploadingFile(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Parcel Verification Workflow</h1>
          <p className="text-muted-foreground mt-1">
            Manage parcel verification requests and document submissions
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <FileText className="w-4 h-4 mr-2" />
              New Verification Request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Verification Request</DialogTitle>
              <DialogDescription>
                Submit a new parcel for verification
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="parcelId">Parcel ID</Label>
                <Input
                  id="parcelId"
                  value={parcelId}
                  onChange={(e) => setParcelId(e.target.value)}
                  placeholder="e.g., LG-VI-2024-001"
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional information about this verification request"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate({ parcelId, notes })}
                disabled={!parcelId || createMutation.isPending}
              >
                Create Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status Filter */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filter by Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedStatus === 'all' ? 'default' : 'outline'}
              onClick={() => setSelectedStatus('all')}
            >
              All
            </Button>
            {Object.entries(statusConfig).map(([status, config]) => (
              <Button
                key={status}
                variant={selectedStatus === status ? 'default' : 'outline'}
                onClick={() => setSelectedStatus(status as VerificationStatus)}
              >
                {config.icon}
                <span className="ml-2">{config.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Verification Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Verification Requests</CardTitle>
          <CardDescription>
            {requests?.total || 0} total requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Parcel ID</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests?.requests.map((request) => (
                <>
                  <TableRow key={request.id}>
                    <TableCell className="font-mono">#{request.id}</TableCell>
                    <TableCell className="font-mono">{request.parcelId}</TableCell>
                    <TableCell>{request.requesterName || 'Unknown'}</TableCell>
                    <TableCell>{request.reviewerName || 'Unassigned'}</TableCell>
                    <TableCell>
                      <Badge className={statusConfig[request.status].color}>
                        {statusConfig[request.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>{request.documents.length} files</TableCell>
                    <TableCell>
                      {request.submittedAt
                        ? new Date(request.submittedAt).toLocaleDateString()
                        : 'Not submitted'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {request.status === 'draft' && request.requesterId === user?.id && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedRequest(request.id);
                                setUploadDialogOpen(true);
                              }}
                            >
                              <Upload className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => submitMutation.mutate({ requestId: request.id })}
                              disabled={request.documents.length === 0}
                            >
                              Submit
                            </Button>
                          </>
                        )}
                        {request.status === 'submitted' && isAdmin && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedRequest(request.id);
                              setAssignDialogOpen(true);
                            }}
                          >
                            <UserPlus className="w-4 h-4 mr-1" />
                            Assign
                          </Button>
                        )}
                        {request.status === 'under_review' && isAdmin && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approveMutation.mutate({ requestId: request.id })}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedRequest(request.id);
                                setRejectDialogOpen(true);
                              }}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedRow(expandedRow === request.id ? null : request.id)}
                      >
                        {expandedRow === request.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedRow === request.id && (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/50">
                        <div className="p-4 space-y-4">
                          {/* Documents */}
                          <div>
                            <h4 className="font-semibold mb-2">Documents</h4>
                            {requestDetails?.documents.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No documents uploaded</p>
                            ) : (
                              <div className="grid gap-2">
                                {requestDetails?.documents.map((doc) => (
                                  <div key={doc.id} className="flex items-center justify-between p-2 border rounded">
                                    <div className="flex items-center gap-2">
                                      <FileText className="w-4 h-4" />
                                      <div>
                                        <p className="text-sm font-medium">{doc.fileName}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {doc.documentType} • {(doc.fileSize / 1024).toFixed(2)} KB
                                        </p>
                                      </div>
                                    </div>
                                    <Button size="sm" variant="outline" asChild>
                                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                                        View
                                      </a>
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* History */}
                          <div>
                            <h4 className="font-semibold mb-2">History</h4>
                            <div className="space-y-2">
                              {history?.map((entry) => (
                                <div key={entry.id} className="flex items-start gap-2 text-sm">
                                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                                  <div>
                                    <p>
                                      <span className="font-medium">{entry.userName}</span> {entry.action}
                                    </p>
                                    {entry.comment && (
                                      <p className="text-muted-foreground">{entry.comment}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(entry.createdAt).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Notes */}
                          {requestDetails?.notes && (
                            <div>
                              <h4 className="font-semibold mb-2">Notes</h4>
                              <p className="text-sm text-muted-foreground">{requestDetails.notes}</p>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Assign Reviewer Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Reviewer</DialogTitle>
            <DialogDescription>
              Assign a reviewer to this verification request
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="reviewerId">Reviewer User ID</Label>
            <Input
              id="reviewerId"
              type="number"
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
              placeholder="Enter user ID"
            />
            <p className="text-xs text-muted-foreground mt-1">
              In production, this would be a dropdown of available reviewers
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                assignMutation.mutate({
                  requestId: selectedRequest!,
                  reviewerId: parseInt(reviewerId),
                })
              }
              disabled={!reviewerId || assignMutation.isPending}
            >
              Assign Reviewer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Verification Request</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this verification request
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="rejectionReason">Rejection Reason</Label>
            <Textarea
              id="rejectionReason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain why this request is being rejected"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                rejectMutation.mutate({
                  requestId: selectedRequest!,
                  reason: rejectionReason,
                })
              }
              disabled={!rejectionReason || rejectMutation.isPending}
            >
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload supporting documents for this verification request
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="documentType">Document Type</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="survey_plan">Survey Plan</SelectItem>
                  <SelectItem value="title_deed">Title Deed</SelectItem>
                  <SelectItem value="proof_of_ownership">Proof of Ownership</SelectItem>
                  <SelectItem value="government_approval">Government Approval</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Accepted formats: PDF, JPG, PNG, DOC, DOCX (max 10MB)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleFileUpload}
              disabled={!selectedFile || !documentType || uploadingFile}
            >
              {uploadingFile ? 'Uploading...' : 'Upload Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
