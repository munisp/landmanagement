import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { parcelService, transactionService } from './db';
import { searchParcels } from './parcelRepository';
import { listTransactions } from './transactionRepository';

export type ReportFormat = 'pdf' | 'excel' | 'csv';
export type ReportTemplate = 'parcel_registry' | 'transaction_summary' | 'financial_overview';

export interface ReportConfig {
  template: ReportTemplate;
  format: ReportFormat;
  fields: string[];
  filters?: Record<string, any>;
  sorting?: { field: string; direction: 'asc' | 'desc' };
  groupBy?: string;
}

/**
 * Generate a report based on the provided configuration
 */
export async function generateReport(config: ReportConfig): Promise<Buffer> {
  // Fetch data based on template
  const data = await fetchReportData(config);

  // Generate report in the requested format
  switch (config.format) {
    case 'pdf':
      return generatePDFReport(data, config);
    case 'excel':
      return generateExcelReport(data, config);
    case 'csv':
      return generateCSVReport(data, config);
    default:
      throw new Error(`Unsupported format: ${config.format}`);
  }
}

/**
 * Fetch data for the report based on template and filters
 */
async function fetchReportData(config: ReportConfig): Promise<any[]> {
  const { template, filters = {} } = config;

  switch (template) {
    case 'parcel_registry':
      return fetchParcelData(filters);
    case 'transaction_summary':
      return fetchTransactionData(filters);
    case 'financial_overview':
      return fetchFinancialData(filters);
    default:
      throw new Error(`Unknown template: ${template}`);
  }
}

/**
 * Fetch parcel data with filters
 */
async function fetchParcelData(filters: Record<string, any>): Promise<any[]> {
  try {
    const response = await parcelService.get('/api/v1/parcels', { params: filters });
    return response.parcels || [];
  } catch (error) {
    console.error('Error fetching parcel data:', error);
    const offline = await searchParcels({
      query: filters.query,
      state: filters.state,
      lga: filters.lga,
      status: filters.status,
      page: 1,
      limit: 500,
    });
    return offline.parcels.map((parcel) => ({
      ...parcel,
      location: parcel.streetAddress ?? `${parcel.lga}, ${parcel.state}`,
      ownerName: parcel.verifierId ?? parcel.surveyorId ?? 'Registry User',
    }));
  }
}

/**
 * Fetch transaction data with filters
 */
async function fetchTransactionData(filters: Record<string, any>): Promise<any[]> {
  try {
    const response = await transactionService.get('/api/v1/transactions', { params: filters });
    return response.transactions || [];
  } catch (error) {
    console.error('Error fetching transaction data:', error);
    const offline = await listTransactions({
      status: filters.status,
      type: filters.type,
      page: 1,
      limit: 500,
    });
    return offline.transactions.map((transaction) => ({
      ...transaction,
      buyerName: transaction.counterpartyName ?? transaction.initiatorName,
      amount: transaction.considerationAmount,
      totalAmount: transaction.considerationAmount,
    }));
  }
}

/**
 * Fetch financial data (aggregated transaction data)
 */
async function fetchFinancialData(filters: Record<string, any>): Promise<any[]> {
  // For financial overview, we fetch transaction data and aggregate it
  const txData = await fetchTransactionData(filters);

  // Group by month and calculate totals
  const grouped = txData.reduce((acc: any, tx: any) => {
    const month = new Date(tx.createdAt).toISOString().slice(0, 7); // YYYY-MM
    if (!acc[month]) {
      acc[month] = {
        month,
        count: 0,
        totalAmount: 0,
        completed: 0,
        pending: 0,
        rejected: 0,
      };
    }
    acc[month].count++;
    acc[month].totalAmount += tx.amount || 0;
    if (tx.status === 'completed') acc[month].completed++;
    if (tx.status === 'pending_approval') acc[month].pending++;
    if (tx.status === 'rejected') acc[month].rejected++;
    return acc;
  }, {});

  return Object.values(grouped);
}

/**
 * Generate PDF report
 */
async function generatePDFReport(data: any[], config: ReportConfig): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text(getReportTitle(config.template), { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Table headers
    const headers = config.fields;
    const columnWidth = (doc.page.width - 100) / headers.length;

    doc.fontSize(12).fillColor('#000');
    headers.forEach((header, i) => {
      doc.text(header, 50 + i * columnWidth, doc.y, {
        width: columnWidth,
        align: 'left',
      });
    });
    doc.moveDown();

    // Table rows
    doc.fontSize(10);
    data.forEach((row) => {
      const y = doc.y;
      headers.forEach((header, i) => {
        const value = row[header] || 'N/A';
        doc.text(String(value), 50 + i * columnWidth, y, {
          width: columnWidth,
          align: 'left',
        });
      });
      doc.moveDown();

      // Add new page if needed
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }
    });

    // Footer
    doc.fontSize(8).text(
      `Total Records: ${data.length}`,
      50,
      doc.page.height - 50,
      { align: 'center' }
    );

    doc.end();
  });
}

/**
 * Generate Excel report
 */
async function generateExcelReport(data: any[], config: ReportConfig): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(getReportTitle(config.template));

  // Add headers
  worksheet.columns = config.fields.map((field) => ({
    header: field,
    key: field,
    width: 20,
  }));

  // Style headers
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Add data rows
  data.forEach((row) => {
    const rowData: any = {};
    config.fields.forEach((field) => {
      rowData[field] = row[field] || 'N/A';
    });
    worksheet.addRow(rowData);
  });

  // Auto-filter
  worksheet.autoFilter = {
    from: 'A1',
    to: `${String.fromCharCode(64 + config.fields.length)}1`,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generate CSV report
 */
async function generateCSVReport(data: any[], config: ReportConfig): Promise<Buffer> {
  const headers = config.fields;
  const rows = data.map((row) =>
    headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return String(value);
    })
  );

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n');

  return Buffer.from(csvContent, 'utf-8');
}

/**
 * Get human-readable report title
 */
function getReportTitle(template: ReportTemplate): string {
  switch (template) {
    case 'parcel_registry':
      return 'Parcel Registry Report';
    case 'transaction_summary':
      return 'Transaction Summary Report';
    case 'financial_overview':
      return 'Financial Overview Report';
    default:
      return 'Report';
  }
}
