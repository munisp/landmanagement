import { useState } from "react";
import { BadgeDollarSign, ReceiptText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Invoice = {
  invoiceKey: string;
  status: string;
  currency: string;
  totalMinor: number;
  dueAt?: string | Date | null;
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value / 100);
}

function statusVariant(status: string) {
  if (status === "paid") return "default" as const;
  if (["issued", "overdue"].includes(status)) return "secondary" as const;
  return "outline" as const;
}

export function CommercialBillingPanel({ accountKey, invoices, onChanged }: { accountKey: string; invoices: Invoice[]; onChanged: () => Promise<unknown> | unknown }) {
  const [invoiceKey, setInvoiceKey] = useState("");
  const [providerTransactionId, setProviderTransactionId] = useState("");
  const issueInvoice = trpc.commercialLender.issueInvoice.useMutation({
    onSuccess: async () => { toast.success("Commercial invoice issued"); await onChanged(); },
    onError: (error) => toast.error(error.message),
  });
  const initializePayment = trpc.commercialLender.initializeInvoicePayment.useMutation({
    onSuccess: (payment) => { toast.success("Secure commercial checkout created; complete payment and return to verify it."); window.location.assign(payment.authorizationUrl); },
    onError: (error) => toast.error(error.message),
  });
  const verifyPayment = trpc.commercialLender.verifyInvoicePayment.useMutation({
    onSuccess: async () => { toast.success("Provider-confirmed payment recorded and subscription renewed"); setInvoiceKey(""); setProviderTransactionId(""); await onChanged(); },
    onError: (error) => toast.error(error.message),
  });
  const payable = invoices.filter((invoice) => invoice.status === "issued" || invoice.status === "overdue");
  const callbackUrl = `${window.location.origin}${window.location.pathname}`;

  return <div className="grid gap-6 xl:grid-cols-2">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5" /> Commercial invoices</CardTitle><CardDescription>Invoices reflect the account’s active product plan. Payment state is not accepted from browser input.</CardDescription></CardHeader><CardContent className="space-y-3"><Button disabled={issueInvoice.isPending} onClick={() => issueInvoice.mutate({ accountKey })}><BadgeDollarSign className="mr-2 h-4 w-4" /> Issue current subscription invoice</Button>{invoices.length ? invoices.map((invoice) => <div key={invoice.invoiceKey} className="rounded border p-3"><div className="flex items-center justify-between gap-3"><span className="font-medium">{invoice.invoiceKey}</span><Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{money(invoice.totalMinor, invoice.currency)} · due {invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "not issued"}</p></div>) : <p className="text-sm text-muted-foreground">No commercial invoices have been issued.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Provider-verified payment</CardTitle><CardDescription>Open a server-created checkout for the selected invoice, then have the server verify provider payment, exact amount, and currency before commercial access renews.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="space-y-2"><Label>Invoice</Label><Select value={invoiceKey} onValueChange={setInvoiceKey}><SelectTrigger><SelectValue placeholder="Select an issued invoice" /></SelectTrigger><SelectContent>{payable.map((invoice) => <SelectItem key={invoice.invoiceKey} value={invoice.invoiceKey}>{invoice.invoiceKey} · {money(invoice.totalMinor, invoice.currency)} · {invoice.currency}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Flutterwave transaction ID after redirect</Label><Input value={providerTransactionId} onChange={(event) => setProviderTransactionId(event.target.value)} placeholder="Not required for Paystack" /></div><div className="flex flex-wrap gap-2"><Button disabled={initializePayment.isPending || !invoiceKey} onClick={() => initializePayment.mutate({ accountKey, invoiceKey, callbackUrl })}>{initializePayment.isPending ? "Opening checkout…" : "Open secure checkout"}</Button><Button variant="outline" disabled={verifyPayment.isPending || !invoiceKey} onClick={() => verifyPayment.mutate({ accountKey, invoiceKey, providerTransactionId: providerTransactionId || undefined })}>{verifyPayment.isPending ? "Verifying…" : "Verify provider payment"}</Button></div><p className="text-xs text-muted-foreground">Checkout fails closed until the selected provider and credential are configured. Flutterwave requires the transaction ID returned at its redirect; Paystack uses the server-created commercial reference.</p></CardContent></Card>
  </div>;
}
