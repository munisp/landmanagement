import { ReportBuilder, ReportConfig, ReportTemplate } from './ReportBuilder';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

const templates: ReportTemplate[] = [
  {
    id: 'parcel_registry',
    name: 'Parcel Registry Report',
    description: 'Comprehensive list of all parcels with ownership details',
    category: 'parcel',
    fields: [
      { id: '1', label: 'Parcel ID', key: 'id', type: 'text', required: true, defaultIncluded: true },
      { id: '2', label: 'Location', key: 'location', type: 'text', required: true, defaultIncluded: true },
      { id: '3', label: 'Area (sqm)', key: 'areaSquareMeters', type: 'number', required: false, defaultIncluded: true },
      { id: '4', label: 'Owner Name', key: 'ownerName', type: 'text', required: false, defaultIncluded: true },
      { id: '5', label: 'Land Use', key: 'landUse', type: 'text', required: false, defaultIncluded: true },
      { id: '6', label: 'Status', key: 'status', type: 'text', required: false, defaultIncluded: true },
      { id: '7', label: 'State', key: 'state', type: 'text', required: false, defaultIncluded: false },
      { id: '8', label: 'LGA', key: 'lga', type: 'text', required: false, defaultIncluded: false },
    ],
    filters: [
      { id: '1', label: 'State', key: 'state', type: 'text' },
      { id: '2', label: 'Status', key: 'status', type: 'select', options: ['verified', 'pending', 'disputed'] },
      { id: '3', label: 'LGA', key: 'lga', type: 'text' },
      { id: '4', label: 'Area Range (sqm)', key: 'areaRange', type: 'number-range' },
    ],
  },
  {
    id: 'transaction_summary',
    name: 'Transaction Summary Report',
    description: 'Summary of all land transactions within a period',
    category: 'transaction',
    fields: [
      { id: '1', label: 'Transaction ID', key: 'id', type: 'text', required: true, defaultIncluded: true },
      { id: '2', label: 'Type', key: 'type', type: 'text', required: true, defaultIncluded: true },
      { id: '3', label: 'Parcel ID', key: 'parcelId', type: 'text', required: false, defaultIncluded: true },
      { id: '4', label: 'Buyer', key: 'buyerName', type: 'text', required: false, defaultIncluded: true },
      { id: '5', label: 'Seller', key: 'sellerName', type: 'text', required: false, defaultIncluded: true },
      { id: '6', label: 'Amount', key: 'amount', type: 'currency', required: false, defaultIncluded: true },
      { id: '7', label: 'Status', key: 'status', type: 'text', required: false, defaultIncluded: true },
      { id: '8', label: 'Date', key: 'createdAt', type: 'date', required: false, defaultIncluded: true },
    ],
    filters: [
      { id: '1', label: 'Transaction Type', key: 'type', type: 'select', options: ['transfer', 'registration', 'subdivision', 'consolidation'] },
      { id: '2', label: 'Status', key: 'status', type: 'select', options: ['completed', 'pending_approval', 'rejected'] },
      { id: '3', label: 'Date Range', key: 'dateRange', type: 'date-range' },
      { id: '4', label: 'Amount Range', key: 'amountRange', type: 'number-range' },
    ],
  },
  {
    id: 'financial_overview',
    name: 'Financial Overview Report',
    description: 'Financial summary with revenue and transaction metrics',
    category: 'financial',
    fields: [
      { id: '1', label: 'Month', key: 'month', type: 'text', required: true, defaultIncluded: true },
      { id: '2', label: 'Total Transactions', key: 'count', type: 'number', required: true, defaultIncluded: true },
      { id: '3', label: 'Total Amount', key: 'totalAmount', type: 'currency', required: true, defaultIncluded: true },
      { id: '4', label: 'Completed', key: 'completed', type: 'number', required: false, defaultIncluded: true },
      { id: '5', label: 'Pending', key: 'pending', type: 'number', required: false, defaultIncluded: true },
      { id: '6', label: 'Rejected', key: 'rejected', type: 'number', required: false, defaultIncluded: false },
    ],
    filters: [
      { id: '1', label: 'Date Range', key: 'dateRange', type: 'date-range' },
    ],
  },
];

export function ConnectedReportBuilder() {
  const generateReport = trpc.reports.generate.useMutation();

  const handleGenerate = async (config: ReportConfig) => {
    try {
      // Map ReportConfig to tRPC input format
      const result = await generateReport.mutateAsync({
        template: config.templateId as 'parcel_registry' | 'transaction_summary' | 'financial_overview',
        format: config.format,
        fields: config.includedFields,
        filters: config.filters,
        sorting: config.sortBy ? {
          field: config.sortBy,
          direction: config.sortOrder,
        } : undefined,
        groupBy: config.groupBy,
      });

      // Convert base64 to blob and trigger download
      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: result.mimeType });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Report generated successfully!');
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate report. Please try again.');
    }
  };

  const handlePreview = (config: ReportConfig) => {
    const template = templates.find((item) => item.id === config.templateId);

    if (!template) {
      toast.error('Unable to preview this report template.');
      return;
    }

    const selectedFields = template.fields.filter((field) => config.includedFields.includes(field.key));
    const filters = Object.entries(config.filters || {}).filter(([, value]) => value !== undefined && value !== null && value !== '');
    const previewWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=800');

    if (!previewWindow) {
      toast.error('Preview window was blocked by the browser.');
      return;
    }

    const fieldRows = selectedFields.length
      ? selectedFields.map((field) => `<tr><td>${field.label}</td><td>${field.key}</td><td>${field.type}</td></tr>`).join('')
      : '<tr><td colspan="3">No fields selected</td></tr>';

    const filterRows = filters.length
      ? filters.map(([key, value]) => `<tr><td>${key}</td><td>${String(value)}</td></tr>`).join('')
      : '<tr><td colspan="2">No filters applied</td></tr>';

    previewWindow.document.write(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${template.name} Preview</title>
    <style>
      body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #0f172a; background: #f8fafc; }
      .card { background: white; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); }
      h1, h2 { margin: 0 0 12px; }
      p { margin: 0 0 8px; line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
      th { background: #eff6ff; }
      .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #dbeafe; color: #1d4ed8; font-size: 12px; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <span class="badge">Preview</span>
      <h1>${template.name}</h1>
      <p>${template.description}</p>
      <div class="meta">
        <p><strong>Category:</strong> ${template.category}</p>
        <p><strong>Format:</strong> ${config.format.toUpperCase()}</p>
        <p><strong>Sort By:</strong> ${config.sortBy || 'Not set'}</p>
        <p><strong>Sort Order:</strong> ${config.sortOrder || 'Not set'}</p>
        <p><strong>Group By:</strong> ${config.groupBy || 'None'}</p>
        <p><strong>Included Fields:</strong> ${selectedFields.length}</p>
      </div>
    </div>
    <div class="card">
      <h2>Selected Fields</h2>
      <table>
        <thead><tr><th>Label</th><th>Key</th><th>Type</th></tr></thead>
        <tbody>${fieldRows}</tbody>
      </table>
    </div>
    <div class="card">
      <h2>Applied Filters</h2>
      <table>
        <thead><tr><th>Filter</th><th>Value</th></tr></thead>
        <tbody>${filterRows}</tbody>
      </table>
    </div>
  </body>
</html>`);
    previewWindow.document.close();
    toast.success('Preview opened in a new window.');
  };

  return (
    <ReportBuilder
      templates={templates}
      onGenerate={handleGenerate}
      onPreview={handlePreview}
    />
  );
}
