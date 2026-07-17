import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { storagePut } from '../storage';

const REPORTS_DIR = '/tmp/reports';

// Ensure reports directory exists
async function ensureReportsDir() {
  try {
    await mkdir(REPORTS_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
}

export interface TransactionReportData {
  transactionId: string;
  parcelId: string;
  parcelAddress: string;
  transactionType: string;
  status: string;
  createdAt: Date;
  updatedAt?: Date;
  amount?: number;
  buyer?: string;
  seller?: string;
  systems: Array<{
    name: string;
    status: string;
    progress: number;
  }>;
  blockchainTxHash?: string;
  paymentStatus?: string;
}

/**
 * Generate PDF report for transaction
 */
export async function generateTransactionPDF(
  data: TransactionReportData
): Promise<string> {
  await ensureReportsDir();

  const filename = `transaction-${data.transactionId}-${Date.now()}.pdf`;
  const filepath = path.join(REPORTS_DIR, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = createWriteStream(filepath);

    stream.on('finish', async () => {
      try {
        // Upload to S3
        const fileBuffer = require('fs').readFileSync(filepath);
        const { url } = await storagePut(
          `reports/${filename}`,
          fileBuffer,
          'application/pdf'
        );
        resolve(url);
      } catch (error) {
        reject(error);
      }
    });

    stream.on('error', reject);
    doc.pipe(stream);

    // Header
    doc
      .fontSize(20)
      .text('Transaction Report', { align: 'center' })
      .moveDown();

    // Transaction Details
    doc.fontSize(16).text('Transaction Details', { underline: true }).moveDown(0.5);

    doc.fontSize(12);
    doc.text(`Transaction ID: ${data.transactionId}`);
    doc.text(`Parcel ID: ${data.parcelId}`);
    doc.text(`Parcel Address: ${data.parcelAddress}`);
    doc.text(`Transaction Type: ${data.transactionType}`);
    doc.text(`Status: ${data.status}`);
    doc.text(`Created: ${data.createdAt.toLocaleString()}`);
    if (data.updatedAt) {
      doc.text(`Updated: ${data.updatedAt.toLocaleString()}`);
    }
    if (data.amount) {
      doc.text(`Amount: ₦${data.amount.toLocaleString()}`);
    }
    if (data.buyer) {
      doc.text(`Buyer: ${data.buyer}`);
    }
    if (data.seller) {
      doc.text(`Seller: ${data.seller}`);
    }
    doc.moveDown();

    // Systems Status
    doc.fontSize(16).text('Systems Status', { underline: true }).moveDown(0.5);

    doc.fontSize(12);
    data.systems.forEach((system) => {
      doc.text(`${system.name}: ${system.status} (${system.progress}%)`);
    });
    doc.moveDown();

    // Blockchain Info
    if (data.blockchainTxHash) {
      doc
        .fontSize(16)
        .text('Blockchain Information', { underline: true })
        .moveDown(0.5);
      doc.fontSize(12);
      doc.text(`Transaction Hash: ${data.blockchainTxHash}`);
      doc.moveDown();
    }

    // Payment Info
    if (data.paymentStatus) {
      doc
        .fontSize(16)
        .text('Payment Information', { underline: true })
        .moveDown(0.5);
      doc.fontSize(12);
      doc.text(`Payment Status: ${data.paymentStatus}`);
      doc.moveDown();
    }

    // Footer
    doc
      .fontSize(10)
      .text(
        `Generated on ${new Date().toLocaleString()}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );

    doc.end();
  });
}

/**
 * Generate Excel report for transaction
 */
export async function generateTransactionExcel(
  data: TransactionReportData
): Promise<string> {
  await ensureReportsDir();

  const filename = `transaction-${data.transactionId}-${Date.now()}.xlsx`;
  const filepath = path.join(REPORTS_DIR, filename);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Transaction Report');

  // Set column widths
  worksheet.columns = [
    { width: 25 },
    { width: 40 },
  ];

  // Title
  worksheet.mergeCells('A1:B1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Transaction Report';
  titleCell.font = { size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center' };

  // Transaction Details
  let row = 3;
  worksheet.getCell(`A${row}`).value = 'Transaction Details';
  worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
  row += 1;

  const details = [
    ['Transaction ID', data.transactionId],
    ['Parcel ID', data.parcelId],
    ['Parcel Address', data.parcelAddress],
    ['Transaction Type', data.transactionType],
    ['Status', data.status],
    ['Created', data.createdAt.toLocaleString()],
  ];

  if (data.updatedAt) {
    details.push(['Updated', data.updatedAt.toLocaleString()]);
  }
  if (data.amount) {
    details.push(['Amount', `₦${data.amount.toLocaleString()}`]);
  }
  if (data.buyer) {
    details.push(['Buyer', data.buyer]);
  }
  if (data.seller) {
    details.push(['Seller', data.seller]);
  }

  details.forEach(([key, value]) => {
    worksheet.getCell(`A${row}`).value = key;
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).value = value;
    row += 1;
  });

  // Systems Status
  row += 1;
  worksheet.getCell(`A${row}`).value = 'Systems Status';
  worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
  row += 1;

  worksheet.getCell(`A${row}`).value = 'System';
  worksheet.getCell(`A${row}`).font = { bold: true };
  worksheet.getCell(`B${row}`).value = 'Status (Progress)';
  worksheet.getCell(`B${row}`).font = { bold: true };
  row += 1;

  data.systems.forEach((system) => {
    worksheet.getCell(`A${row}`).value = system.name;
    worksheet.getCell(`B${row}`).value = `${system.status} (${system.progress}%)`;
    row += 1;
  });

  // Blockchain Info
  if (data.blockchainTxHash) {
    row += 1;
    worksheet.getCell(`A${row}`).value = 'Blockchain Information';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    row += 1;

    worksheet.getCell(`A${row}`).value = 'Transaction Hash';
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).value = data.blockchainTxHash;
    row += 1;
  }

  // Payment Info
  if (data.paymentStatus) {
    row += 1;
    worksheet.getCell(`A${row}`).value = 'Payment Information';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    row += 1;

    worksheet.getCell(`A${row}`).value = 'Payment Status';
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`B${row}`).value = data.paymentStatus;
    row += 1;
  }

  // Footer
  row += 2;
  worksheet.mergeCells(`A${row}:B${row}`);
  const footerCell = worksheet.getCell(`A${row}`);
  footerCell.value = `Generated on ${new Date().toLocaleString()}`;
  footerCell.alignment = { horizontal: 'center' };
  footerCell.font = { size: 10, italic: true };

  // Save workbook
  await workbook.xlsx.writeFile(filepath);

  // Upload to S3
  const fileBuffer = require('fs').readFileSync(filepath);
  const { url } = await storagePut(
    `reports/${filename}`,
    fileBuffer,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  return url;
}

/**
 * Generate transaction report in specified format
 */
export async function generateTransactionReport(
  data: TransactionReportData,
  format: 'pdf' | 'excel'
): Promise<string> {
  if (format === 'pdf') {
    return generateTransactionPDF(data);
  } else {
    return generateTransactionExcel(data);
  }
}
