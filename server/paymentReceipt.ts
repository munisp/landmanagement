import PDFDocument from 'pdfkit';
import { buildPaymentReceipt } from './paymentRepository';

function currency(amount: number, code: string) {
  return `${code} ${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function writeRow(doc: PDFKit.PDFDocument, label: string, value: string, y: number) {
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#334155')
    .text(label, 50, y)
    .font('Helvetica')
    .fillColor('#0f172a')
    .text(value, 220, y, { width: 320 });
}

export async function generatePaymentReceiptPdf(transactionId: number): Promise<Buffer> {
  const payload = await buildPaymentReceipt(transactionId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor('#0f172a')
      .text('IDLR PTS Payment Receipt');

    doc
      .moveDown(0.3)
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#475569')
      .text('Integrated Digital Land Registry - Property Transaction System')
      .text('Official property transaction remittance acknowledgment');

    doc.roundedRect(50, 110, 495, 85, 8).fillAndStroke('#ecfeff', '#67e8f9');
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(`Receipt No: ${payload.payment.receiptNumber || 'Pending issuance'}`, 65, 125)
      .text(`Payment Reference: ${payload.payment.reference}`, 65, 145)
      .text(`Issued: ${new Date(payload.issuedAt).toLocaleString('en-NG')}`, 65, 165);

    doc.roundedRect(50, 220, 495, 250, 8).stroke('#cbd5e1');
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a').text('Transaction Summary', 65, 238);

    let y = 270;
    writeRow(doc, 'Transaction ID', String(payload.transaction.id), y);
    y += 22;
    writeRow(doc, 'Transaction Type', payload.transaction.type, y);
    y += 22;
    writeRow(doc, 'Parcel ID', String(payload.transaction.parcelId), y);
    y += 22;
    writeRow(doc, 'Workflow Stage', payload.transaction.workflowStage, y);
    y += 22;
    writeRow(doc, 'Payment Method', payload.payment.method.replace('_', ' '), y);
    y += 22;
    writeRow(doc, 'Payment Status', payload.payment.status, y);
    y += 22;
    writeRow(doc, 'Amount', currency(payload.payment.amount, payload.payment.currency), y);
    y += 22;
    writeRow(doc, 'Processing Fee', currency(payload.payment.feeAmount, payload.payment.currency), y);
    y += 22;
    writeRow(doc, 'Total Paid', currency(payload.payment.totalAmount, payload.payment.currency), y);
    y += 22;
    writeRow(doc, 'Channel Reference', payload.payment.channelReference || 'N/A', y);
    y += 22;
    writeRow(doc, 'Paid At', payload.payment.paidAt ? new Date(payload.payment.paidAt).toLocaleString('en-NG') : 'Pending confirmation', y);

    doc.roundedRect(50, 490, 495, 120, 8).fillAndStroke('#f8fafc', '#cbd5e1');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text('Remittance Details', 65, 508);
    writeRow(doc, 'Receiving Bank', payload.remittanceBank, 540);
    writeRow(doc, 'Account Name', payload.remittanceAccountName, 562);
    writeRow(doc, 'Account Number', payload.remittanceAccountNumber, 584);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#64748b')
      .text(
        'This receipt confirms that the stated amount was processed through the IDLR PTS payment workflow. Keep this document together with your transaction file, tax receipts, and supporting registry instruments for audit and compliance review.',
        50,
        640,
        { width: 495, align: 'left' },
      );

    doc.end();
  });
}
