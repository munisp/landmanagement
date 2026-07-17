import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  FileText, 
  DollarSign, 
  User,
  Loader2,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

type TransactionType = 'registration' | 'transfer' | 'subdivision' | 'consolidation' | 'mortgage' | 'lease';

const TRANSACTION_TYPES: { value: TransactionType; label: string; description: string }[] = [
  { value: 'registration', label: 'New Registration', description: 'Register a new land parcel' },
  { value: 'transfer', label: 'Property Transfer', description: 'Transfer ownership to another party' },
  { value: 'subdivision', label: 'Land Subdivision', description: 'Divide a parcel into multiple parcels' },
  { value: 'consolidation', label: 'Land Consolidation', description: 'Merge multiple parcels into one' },
  { value: 'mortgage', label: 'Mortgage Registration', description: 'Register a mortgage on the property' },
  { value: 'lease', label: 'Lease Agreement', description: 'Register a lease on the property' },
];

export default function InitiateTransaction() {
  const [, params] = useRoute("/transactions/initiate/:parcelId");
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  
  const parcelId = params?.parcelId ? parseInt(params.parcelId) : null;
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    type: '' as TransactionType | '',
    toOwnerId: '',
    toOwnerName: '',
    toOwnerEmail: '',
    transactionAmount: '',
    description: '',
  });

  const { data: parcel, isLoading: parcelLoading } = trpc.parcels.getById.useQuery(
    { id: parcelId! },
    { enabled: !!parcelId }
  );

  const initiateMutation = trpc.transactions.initiate.useMutation({
    onSuccess: (data) => {
      toast.success('Transaction initiated successfully!');
      navigate(`/transactions/${data.id}`);
    },
    onError: (error) => {
      toast.error(`Failed to initiate transaction: ${error.message}`);
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Authentication Required</h3>
            <p className="text-muted-foreground mb-4">
              You need to be logged in to initiate a transaction
            </p>
            <a href={getLoginUrl()}>
              <Button>Sign In</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (parcelLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!parcel) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Parcel not found</p>
            <Link href="/search">
              <Button className="mt-4">Back to Search</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleNext = () => {
    if (step === 1 && !formData.type) {
      toast.error('Please select a transaction type');
      return;
    }
    if (step === 2) {
      if (['transfer', 'lease'].includes(formData.type) && (!formData.toOwnerName || !formData.toOwnerEmail)) {
        toast.error('Please provide recipient information');
        return;
      }
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    try {
      await initiateMutation.mutateAsync({
        type: formData.type as TransactionType,
        parcelId: parcelId!,
        toOwnerId: formData.toOwnerId ? parseInt(formData.toOwnerId) : undefined,
        transactionAmount: formData.transactionAmount ? parseFloat(formData.transactionAmount) : undefined,
        description: formData.description || undefined,
      });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const requiresRecipient = ['transfer', 'lease'].includes(formData.type);
  const requiresAmount = ['transfer', 'mortgage', 'lease'].includes(formData.type);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <Link href={`/parcels/${parcelId}`}>
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Parcel Details
            </Button>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    step >= s ? 'border-primary bg-primary text-primary-foreground' : 'border-muted bg-background'
                  }`}>
                    {step > s ? <Check className="h-5 w-5" /> : s}
                  </div>
                  {s < 4 && (
                    <div className={`flex-1 h-1 mx-2 ${
                      step > s ? 'bg-primary' : 'bg-muted'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>Type</span>
              <span>Details</span>
              <span>Payment</span>
              <span>Review</span>
            </div>
          </div>

          {/* Parcel Info Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Transaction for Parcel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Parcel Number:</span>
                  <p className="font-medium">{parcel.parcelNumber}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Location:</span>
                  <p className="font-medium">{parcel.lga}, {parcel.state}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Area:</span>
                  <p className="font-medium">{parcel.areaSquareMeters?.toFixed(2)} m²</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step Content */}
          <Card>
            <CardHeader>
              <CardTitle>
                {step === 1 && 'Select Transaction Type'}
                {step === 2 && 'Transaction Details'}
                {step === 3 && 'Payment Information'}
                {step === 4 && 'Review & Submit'}
              </CardTitle>
              <CardDescription>
                {step === 1 && 'Choose the type of transaction you want to initiate'}
                {step === 2 && 'Provide additional information for this transaction'}
                {step === 3 && 'Enter payment and fee information'}
                {step === 4 && 'Review all details before submitting'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step 1: Transaction Type */}
              {step === 1 && (
                <div className="space-y-4">
                  {TRANSACTION_TYPES.map((type) => (
                    <div
                      key={type.value}
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        formData.type === type.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setFormData({ ...formData, type: type.value })}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold mb-1">{type.label}</h4>
                          <p className="text-sm text-muted-foreground">{type.description}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          formData.type === type.value ? 'border-primary bg-primary' : 'border-muted'
                        }`}>
                          {formData.type === type.value && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Step 2: Transaction Details */}
              {step === 2 && (
                <div className="space-y-4">
                  {requiresRecipient && (
                    <>
                      <div>
                        <Label htmlFor="toOwnerName">Recipient Name *</Label>
                        <Input
                          id="toOwnerName"
                          placeholder="Enter recipient's full name"
                          value={formData.toOwnerName}
                          onChange={(e) => setFormData({ ...formData, toOwnerName: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="toOwnerEmail">Recipient Email *</Label>
                        <Input
                          id="toOwnerEmail"
                          type="email"
                          placeholder="Enter recipient's email address"
                          value={formData.toOwnerEmail}
                          onChange={(e) => setFormData({ ...formData, toOwnerEmail: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Add any additional notes or comments about this transaction..."
                      rows={4}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Step 3: Payment Information */}
              {step === 3 && (
                <div className="space-y-4">
                  {requiresAmount && (
                    <div>
                      <Label htmlFor="transactionAmount">Transaction Amount (NGN) *</Label>
                      <Input
                        id="transactionAmount"
                        type="number"
                        placeholder="0.00"
                        value={formData.transactionAmount}
                        onChange={(e) => setFormData({ ...formData, transactionAmount: e.target.value })}
                      />
                    </div>
                  )}
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-start gap-3">
                      <DollarSign className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-2">Processing Fees</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span>Registration Fee:</span>
                            <span className="font-medium">₦ 50,000</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Processing Fee:</span>
                            <span className="font-medium">₦ 10,000</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Survey Verification:</span>
                            <span className="font-medium">₦ 25,000</span>
                          </div>
                          <div className="border-t pt-1 mt-2 flex justify-between font-semibold">
                            <span>Total Fees:</span>
                            <span>₦ 85,000</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Review */}
              {step === 4 && (
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-3">Transaction Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type:</span>
                        <span className="font-medium">
                          {TRANSACTION_TYPES.find(t => t.value === formData.type)?.label}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Parcel:</span>
                        <span className="font-medium">{parcel.parcelNumber}</span>
                      </div>
                      {requiresRecipient && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Recipient:</span>
                            <span className="font-medium">{formData.toOwnerName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Email:</span>
                            <span className="font-medium">{formData.toOwnerEmail}</span>
                          </div>
                        </>
                      )}
                      {requiresAmount && formData.transactionAmount && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Amount:</span>
                          <span className="font-medium">₦ {parseFloat(formData.transactionAmount).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Processing Fees:</span>
                        <span className="font-medium">₦ 85,000</span>
                      </div>
                    </div>
                  </div>

                  {formData.description && (
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold mb-2">Description</h4>
                      <p className="text-sm text-muted-foreground">{formData.description}</p>
                    </div>
                  )}

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-blue-900 mb-1">Next Steps</p>
                        <p className="text-blue-700">
                          After submission, your transaction will be reviewed by a registrar. 
                          You'll receive notifications about the approval status and any required documents.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={step === 1 || initiateMutation.isPending}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>

                {step < 4 ? (
                  <Button onClick={handleNext}>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={initiateMutation.isPending}>
                    {initiateMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Submit Transaction
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
