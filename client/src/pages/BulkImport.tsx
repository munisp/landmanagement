import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
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
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ParsedParcel {
  row: number;
  parcelNumber: string;
  ownerName: string;
  state: string;
  lga: string;
  ward: string;
  streetAddress: string;
  areaSquareMeters: number;
  landUseType: string;
  surveyPlanNumber: string;
  coordinates: string;
  status: string;
  valid: boolean;
  errors: string[];
}

type RawImportRow = Record<string, unknown>;

const validLandUses = ["Residential", "Commercial", "Agricultural", "Industrial", "Mixed"] as const;
const validStatuses = ["Active", "Pending", "Inactive"] as const;

function getString(row: RawImportRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function getNumber(row: RawImportRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function normalizeLandUse(value: string) {
  const normalized = value.trim().toLowerCase();
  const match = validLandUses.find((item) => item.toLowerCase() === normalized);
  return match ?? value.trim();
}

function normalizeStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  const match = validStatuses.find((item) => item.toLowerCase() === normalized);
  return match ?? value.trim();
}

function validateRow(parcel: ParsedParcel) {
  const errors: string[] = [];

  if (!parcel.parcelNumber) errors.push("Parcel number is required");
  if (!parcel.ownerName) errors.push("Owner name is required");
  if (!parcel.areaSquareMeters || parcel.areaSquareMeters <= 0) errors.push("Area must be greater than 0");
  if (!parcel.coordinates) errors.push("Coordinates are required");
  if (!validLandUses.includes(parcel.landUseType as (typeof validLandUses)[number])) {
    errors.push(`Land use must be one of: ${validLandUses.join(", ")}`);
  }
  if (!validStatuses.includes(parcel.status as (typeof validStatuses)[number])) {
    errors.push(`Status must be one of: ${validStatuses.join(", ")}`);
  }

  return {
    ...parcel,
    valid: errors.length === 0,
    errors,
  };
}

function mapRow(raw: RawImportRow, row: number): ParsedParcel {
  const parcelNumber = getString(raw, ["parcelNumber", "parcel_number", "parcel_id", "parcelId"]);
  const ownerName = getString(raw, ["ownerName", "owner_name", "owner"]);
  const areaSquareMeters = getNumber(raw, ["areaSquareMeters", "area_square_meters", "area"]);
  const coordinates = getString(raw, ["coordinates", "boundaryCoordinates", "boundary_coordinates"]);
  const landUseType = normalizeLandUse(getString(raw, ["landUseType", "land_use_type", "land_use"]));
  const status = normalizeStatus(getString(raw, ["status"]));

  return validateRow({
    row,
    parcelNumber,
    ownerName,
    state: getString(raw, ["state"]),
    lga: getString(raw, ["lga"]),
    ward: getString(raw, ["ward"]),
    streetAddress: getString(raw, ["streetAddress", "street_address", "address"]),
    areaSquareMeters,
    landUseType,
    surveyPlanNumber: getString(raw, ["surveyPlanNumber", "survey_plan_number", "surveyPlan"]),
    coordinates,
    status,
    valid: false,
    errors: [],
  });
}

async function parseSpreadsheet(file: File): Promise<RawImportRow[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    const text = await file.text();
    const parsed = Papa.parse<RawImportRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });

    if (parsed.errors.length > 0) {
      throw new Error(parsed.errors[0]?.message || "Unable to parse CSV file");
    }

    return parsed.data;
  }

  if (extension === "xlsx" || extension === "xls") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("The spreadsheet does not contain any worksheets");
    }

    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json<RawImportRow>(worksheet, { defval: "" });
  }

  throw new Error("Unsupported file type. Please upload a CSV or Excel file.");
}

export default function BulkImport() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedParcel[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importComplete, setImportComplete] = useState(false);
  const [importSummary, setImportSummary] = useState<{ success: number; failed: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const importMutation = trpc.bulkImport.parcels.useMutation();

  const resetWorkflow = () => {
    setFile(null);
    setParsedData([]);
    setImporting(false);
    setImportProgress(0);
    setImportComplete(false);
    setImportSummary(null);
    setParseError(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setImportComplete(false);
    setImportSummary(null);
    setParseError(null);

    try {
      const rawRows = await parseSpreadsheet(selectedFile);
      const mappedRows = rawRows.map((row, index) => mapRow(row, index + 2));
      setParsedData(mappedRows);
    } catch (error) {
      setParsedData([]);
      setParseError(error instanceof Error ? error.message : "Unable to parse the selected file");
    }
  };

  const handleImport = async () => {
    const validParcels = parsedData.filter((parcel) => parcel.valid);
    if (validParcels.length === 0) return;

    setImporting(true);
    setImportProgress(15);
    setParseError(null);

    try {
      setImportProgress(40);
      const result = await importMutation.mutateAsync(
        validParcels.map((parcel) => ({
          parcel_id: parcel.parcelNumber,
          owner_name: parcel.ownerName,
          area: parcel.areaSquareMeters,
          coordinates: parcel.coordinates,
          land_use: parcel.landUseType,
          status: parcel.status,
        }))
      );

      setImportProgress(100);
      setImportSummary({
        success: result.success,
        failed: result.failed + invalidCount,
      });
      setImportComplete(true);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Bulk import failed");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const template = `parcel_id,owner_name,area,coordinates,land_use,status,state,lga,ward,street_address,survey_plan_number\nLG-VI-2024-101,Amina Bello,1200.5,6.4281,3.4219;6.4285,3.4219;6.4285,3.4225;6.4281,3.4225,Residential,Active,Lagos,Victoria Island,Ward 1,123 Ahmadu Bello Way,SP/2024/101\nAB-MA-2024-102,Chinedu Okafor,850,9.0952,7.4956;9.0956,7.4956;9.0956,7.4960;9.0952,7.4960,Commercial,Pending,Abuja,Maitama,Ward 2,15 Aguiyi Ironsi Street,SP/2024/102`;

    const blob = new Blob([template], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parcel_import_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const validCount = parsedData.filter((p) => p.valid).length;
  const invalidCount = parsedData.filter((p) => !p.valid).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              ← Back to Home
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Bulk Import Parcels</h1>
          <div className="w-24"></div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold">Bulk Import Parcels</h1>
            <p className="text-muted-foreground">
              Upload CSV or Excel files, preview normalized parcel records, and import validated rows through the live bulk-import workflow.
            </p>
          </div>

          {parseError && (
            <Alert className="mb-6 border-destructive/40">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Import preparation issue</AlertTitle>
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {!file && !importComplete && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload File
                </CardTitle>
                <CardDescription>
                  Select a CSV or Excel file containing parcel import records.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border-2 border-dashed p-12 text-center">
                  <FileSpreadsheet className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-4 text-sm text-muted-foreground">
                    Drag and drop your file here, or click to browse.
                  </p>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload">
                    <Button asChild>
                      <span>Select File</span>
                    </Button>
                  </label>
                </div>

                <div className="flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-muted-foreground">Download the live parcel-import template</p>
                  <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                    <Download className="h-4 w-4" />
                    Download Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {file && parsedData.length > 0 && !importComplete && (
            <>
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>File Parsed Successfully</AlertTitle>
                <AlertDescription>
                  Found {parsedData.length} rows. {validCount} valid, {invalidCount} invalid. Review the normalized records below before importing.
                </AlertDescription>
              </Alert>

              <Card className="mb-8">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>Preview Data</CardTitle>
                      <CardDescription>Review parsed data from {file.name}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={resetWorkflow}>
                        Cancel
                      </Button>
                      <Button onClick={handleImport} disabled={validCount === 0 || importing} className="gap-2">
                        {importing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            Import {validCount} Parcels
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {importing && (
                    <div className="mb-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">Import Progress</span>
                        <span className="text-sm text-muted-foreground">{Math.round(importProgress)}%</span>
                      </div>
                      <Progress value={importProgress} />
                    </div>
                  )}

                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Row</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Parcel Number</TableHead>
                          <TableHead>Owner</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Area (m²)</TableHead>
                          <TableHead>Land Use</TableHead>
                          <TableHead>Errors</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.map((parcel) => (
                          <TableRow key={parcel.row}>
                            <TableCell>{parcel.row}</TableCell>
                            <TableCell>
                              {parcel.valid ? (
                                <Badge variant="default" className="gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Valid
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="gap-1">
                                  <XCircle className="h-3 w-3" />
                                  Invalid
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{parcel.parcelNumber}</TableCell>
                            <TableCell>{parcel.ownerName || "—"}</TableCell>
                            <TableCell className="text-sm">
                              {[parcel.lga, parcel.state].filter(Boolean).join(", ") || "—"}
                            </TableCell>
                            <TableCell>{parcel.areaSquareMeters || "—"}</TableCell>
                            <TableCell className="capitalize">{parcel.landUseType || "—"}</TableCell>
                            <TableCell>
                              {parcel.errors.length > 0 ? (
                                <ul className="list-inside list-disc text-xs text-destructive">
                                  {parcel.errors.map((error, idx) => (
                                    <li key={idx}>{error}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-xs text-muted-foreground">Ready to import</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {importComplete && importSummary && (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-600" />
                <h2 className="mb-2 text-2xl font-bold">Import Complete</h2>
                <p className="mb-6 text-muted-foreground">
                  Successfully imported {importSummary.success} parcels.
                  {importSummary.failed > 0 ? ` ${importSummary.failed} rows were not imported because they were invalid or failed during processing.` : ""}
                </p>
                <div className="flex justify-center gap-2">
                  <Button onClick={resetWorkflow}>Import Another File</Button>
                  <Link href="/search">
                    <Button variant="outline">View Parcels</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
