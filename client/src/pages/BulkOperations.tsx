/**
 * Bulk Operations
 * Batch processing for parcels, documents, and transactions
 */

import { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type ImportType = 'parcels' | 'documents' | 'transactions';
type ExportType = ImportType | 'users';

type ImportResults = {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
};

const TEMPLATE_ROWS: Record<ExportType, Array<Record<string, string | number>>> = {
  parcels: [
    {
      parcel_id: 'LG-IKJ-001234',
      owner_name: 'John Doe',
      area: 500,
      coordinates: 'SP/2026/0001',
      land_use: 'Residential',
      status: 'Active',
    },
  ],
  documents: [
    {
      document_id: 'DOC-001',
      parcel_id: 'LG-IKJ-001234',
      document_type: 'Title Deed',
      file_url: 'https://example.com/doc.pdf',
      upload_date: '2026-01-15',
    },
  ],
  transactions: [
    {
      transaction_id: 'TXN-001',
      parcel_id: 'LG-IKJ-001234',
      type: 'Transfer',
      amount: 25000000,
      date: '2026-01-15',
      status: 'Completed',
    },
  ],
  users: [
    {
      user_id: 1,
      name: 'System Administrator',
      role: 'admin',
      source: 'system',
    },
  ],
};

async function parseUploadedFile(file: File): Promise<any[]> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data as any[]),
        error: (error) => reject(error),
      });
    });
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
}

function downloadCsv(baseName: string, rows: Array<Record<string, unknown>>) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function BulkOperations() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingType, setExportingType] = useState<ExportType | null>(null);
  const [importType, setImportType] = useState<ImportType>('parcels');
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);

  const utils = trpc.useUtils();
  const importParcelsMutation = trpc.bulkImport.parcels.useMutation();
  const importDocumentsMutation = trpc.bulkImport.documents.useMutation();
  const importTransactionsMutation = trpc.bulkImport.transactions.useMutation();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.xlsx')) {
      toast.error('Please upload a CSV or Excel file');
      return;
    }

    try {
      const rows = await parseUploadedFile(file);
      setUploadedFile(file);
      setPreviewRows(rows.slice(0, 5));
      setImportResults(null);
      toast.success(`Loaded ${rows.length} rows from ${file.name}`);
    } catch (error) {
      toast.error(`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleImport = async (type: ImportType) => {
    if (!uploadedFile) {
      toast.error('Please upload a file first');
      return;
    }

    setImporting(true);

    try {
      const rows = await parseUploadedFile(uploadedFile);
      let importResult: ImportResults;

      if (type === 'parcels') {
        const data = rows.map((row: any) => ({
          ...row,
          area: parseFloat(String(row.area ?? 0)),
        }));
        importResult = await importParcelsMutation.mutateAsync(data as any);
      } else if (type === 'documents') {
        importResult = await importDocumentsMutation.mutateAsync(rows as any);
      } else {
        const data = rows.map((row: any) => ({
          ...row,
          amount: parseFloat(String(row.amount ?? 0)),
        }));
        importResult = await importTransactionsMutation.mutateAsync(data as any);
      }

      setImportResults(importResult);

      if (importResult.failed === 0) {
        toast.success(`All ${importResult.success} records imported successfully`);
      } else {
        toast.warning(`Import completed: ${importResult.success} successful, ${importResult.failed} failed`);
      }
    } catch (error) {
      toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = (type: ExportType) => {
    downloadCsv(`${type}_template`, TEMPLATE_ROWS[type]);
    toast.success(`Template downloaded: ${type}_template.csv`);
  };

  const exportData = async (type: ExportType) => {
    setExportingType(type);
    try {
      const rows = await utils.bulkImport.export.fetch({ type });
      if (!rows.length) {
        toast.info(`No ${type} data available to export`);
        return;
      }
      downloadCsv(`${type}_export_${new Date().toISOString().split('T')[0]}`, rows as Array<Record<string, unknown>>);
      toast.success(`${type} data exported successfully`);
    } catch (error) {
      toast.error(`Failed to export ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExportingType(null);
    }
  };

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Bulk Operations</h1>
        <p className="text-muted-foreground mt-2">
          Import and export parcel, document, transaction, and user datasets with live platform contracts.
        </p>
      </div>

      <Tabs defaultValue="import" className="space-y-6">
        <TabsList>
          <TabsTrigger value="import">Bulk Import</TabsTrigger>
          <TabsTrigger value="export">Bulk Export</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import Data</CardTitle>
              <CardDescription>
                Upload CSV or Excel files to import parcels, documents, or transactions in bulk.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">1. Download Template</h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <Button variant="outline" className="justify-start" onClick={() => downloadTemplate('parcels')}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Parcels Template
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => downloadTemplate('documents')}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Documents Template
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => downloadTemplate('transactions')}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Transactions Template
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">2. Upload File</h3>
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload">
                    <Button asChild variant="outline">
                      <span>Choose File</span>
                    </Button>
                  </label>
                  {uploadedFile && (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Selected: {uploadedFile.name}
                    </p>
                  )}
                </div>
              </div>

              {previewRows.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Preview</CardTitle>
                    <CardDescription>Showing the first {previewRows.length} parsed rows from the uploaded file.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs overflow-auto rounded bg-muted p-4">{JSON.stringify(previewRows, null, 2)}</pre>
                  </CardContent>
                </Card>
              )}

              <div>
                <h3 className="font-semibold mb-3">3. Select Import Type</h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <Button variant={importType === 'parcels' ? 'default' : 'outline'} onClick={() => setImportType('parcels')}>
                    Parcels
                  </Button>
                  <Button variant={importType === 'documents' ? 'default' : 'outline'} onClick={() => setImportType('documents')}>
                    Documents
                  </Button>
                  <Button variant={importType === 'transactions' ? 'default' : 'outline'} onClick={() => setImportType('transactions')}>
                    Transactions
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">4. Import Data</h3>
                <Button onClick={() => handleImport(importType)} disabled={!uploadedFile || importing} className="w-full md:w-auto">
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    'Start Import'
                  )}
                </Button>
              </div>

              {importResults && (
                <div className="space-y-4">
                  <h3 className="font-semibold">Import Results</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <p className="text-2xl font-bold">{importResults.total}</p>
                          <p className="text-sm text-muted-foreground">Total Records</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
                          <p className="text-2xl font-bold text-green-600">{importResults.success}</p>
                          <p className="text-sm text-muted-foreground">Successful</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <XCircle className="h-8 w-8 mx-auto mb-2 text-red-600" />
                          <p className="text-2xl font-bold text-red-600">{importResults.failed}</p>
                          <p className="text-sm text-muted-foreground">Failed</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {importResults.errors.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-red-600" />
                          Import Errors
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {importResults.errors.map((error, index) => (
                            <div key={index} className="p-3 bg-red-50 border border-red-200 rounded text-sm">
                              <span className="font-medium">Row {error.row}:</span> {error.error}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Export Data</CardTitle>
              <CardDescription>
                Download live parcel, document, transaction, and user datasets in CSV format.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {(['parcels', 'documents', 'transactions', 'users'] as ExportType[]).map((type) => (
                  <Card key={type}>
                    <CardHeader>
                      <CardTitle className="text-lg capitalize">{type}</CardTitle>
                      <CardDescription>Export current {type} records from the platform.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button onClick={() => exportData(type)} className="w-full" disabled={exportingType !== null}>
                        {exportingType === type ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Exporting...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Export {type.charAt(0).toUpperCase() + type.slice(1)}
                          </>
                        )}
                      </Button>
                      <Button variant="outline" onClick={() => downloadTemplate(type)} className="w-full" disabled={exportingType !== null}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Download Template
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
