import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface ExportOptions {
  filename?: string;
  title?: string;
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'letter';
}

/**
 * Export a single HTML element to PDF
 */
export async function exportElementToPDF(
  element: HTMLElement,
  options: ExportOptions = {}
): Promise<void> {
  const {
    filename = 'export.pdf',
    title = 'Report',
    orientation = 'portrait',
    format = 'a4',
  } = options;

  try {
    // Capture the element as canvas
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // Calculate PDF dimensions
    const imgWidth = orientation === 'portrait' ? 210 : 297; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Create PDF
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format,
    });

    // Add title
    pdf.setFontSize(16);
    pdf.text(title, 10, 15);

    // Add image
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 10, 25, imgWidth - 20, imgHeight);

    // Save PDF
    pdf.save(filename);
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    throw new Error('Failed to export PDF');
  }
}

/**
 * Export multiple HTML elements to a multi-page PDF
 */
export async function exportMultipleElementsToPDF(
  elements: Array<{ element: HTMLElement; title: string }>,
  options: ExportOptions = {}
): Promise<void> {
  const {
    filename = 'report.pdf',
    title = 'Multi-Page Report',
    orientation = 'portrait',
    format = 'a4',
  } = options;

  try {
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format,
    });

    const imgWidth = orientation === 'portrait' ? 210 : 297;

    // Add cover page
    pdf.setFontSize(20);
    pdf.text(title, 10, 20);
    pdf.setFontSize(12);
    pdf.text(`Generated on ${new Date().toLocaleDateString()}`, 10, 30);

    for (let i = 0; i < elements.length; i++) {
      const { element, title: sectionTitle } = elements[i];

      // Add new page for each element
      pdf.addPage();

      // Capture element as canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Add section title
      pdf.setFontSize(14);
      pdf.text(sectionTitle, 10, 15);

      // Add image
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 10, 25, imgWidth - 20, imgHeight);
    }

    // Save PDF
    pdf.save(filename);
  } catch (error) {
    console.error('Error exporting multi-page PDF:', error);
    throw new Error('Failed to export multi-page PDF');
  }
}

/**
 * Export chart data to PDF with custom formatting
 */
export async function exportChartToPDF(
  chartElement: HTMLElement,
  chartData: {
    title: string;
    description?: string;
    metadata?: Record<string, string | number>;
  },
  options: ExportOptions = {}
): Promise<void> {
  const {
    filename = 'chart-export.pdf',
    orientation = 'landscape',
    format = 'a4',
  } = options;

  try {
    // Capture chart as canvas
    const canvas = await html2canvas(chartElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format,
    });

    const imgWidth = orientation === 'portrait' ? 210 : 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Add title
    pdf.setFontSize(18);
    pdf.text(chartData.title, 10, 15);

    // Add description if provided
    if (chartData.description) {
      pdf.setFontSize(10);
      pdf.text(chartData.description, 10, 25);
    }

    // Add metadata if provided
    if (chartData.metadata) {
      let yPos = chartData.description ? 35 : 25;
      pdf.setFontSize(9);
      Object.entries(chartData.metadata).forEach(([key, value]) => {
        pdf.text(`${key}: ${value}`, 10, yPos);
        yPos += 5;
      });
    }

    // Add chart image
    const imgData = canvas.toDataURL('image/png');
    const chartYPos = chartData.description ? 45 : 35;
    pdf.addImage(imgData, 'PNG', 10, chartYPos, imgWidth - 20, imgHeight);

    // Add footer
    pdf.setFontSize(8);
    pdf.text(
      `Generated on ${new Date().toLocaleString()}`,
      10,
      pdf.internal.pageSize.height - 10
    );

    // Save PDF
    pdf.save(filename);
  } catch (error) {
    console.error('Error exporting chart to PDF:', error);
    throw new Error('Failed to export chart to PDF');
  }
}

/**
 * Generate a commission statement PDF
 */
export async function generateCommissionStatementPDF(
  statementData: {
    brokerName: string;
    period: string;
    totalCommission: number;
    commissions: Array<{
      date: string;
      clientName: string;
      loanAmount: number;
      commissionAmount: number;
      status: string;
    }>;
  },
  options: ExportOptions = {}
): Promise<void> {
  const { filename = 'commission-statement.pdf' } = options;

  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Header
    pdf.setFontSize(20);
    pdf.text('Commission Statement', 10, 20);

    pdf.setFontSize(12);
    pdf.text(`Broker: ${statementData.brokerName}`, 10, 30);
    pdf.text(`Period: ${statementData.period}`, 10, 37);
    pdf.text(
      `Total Commission: ₦${statementData.totalCommission.toLocaleString()}`,
      10,
      44
    );

    // Table header
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    let yPos = 55;
    pdf.text('Date', 10, yPos);
    pdf.text('Client', 40, yPos);
    pdf.text('Loan Amount', 100, yPos);
    pdf.text('Commission', 140, yPos);
    pdf.text('Status', 175, yPos);

    // Table rows
    pdf.setFont('helvetica', 'normal');
    yPos += 7;

    statementData.commissions.forEach((commission) => {
      if (yPos > 270) {
        // Add new page if needed
        pdf.addPage();
        yPos = 20;
      }

      pdf.text(commission.date, 10, yPos);
      pdf.text(commission.clientName.substring(0, 20), 40, yPos);
      pdf.text(`₦${commission.loanAmount.toLocaleString()}`, 100, yPos);
      pdf.text(`₦${commission.commissionAmount.toLocaleString()}`, 140, yPos);
      pdf.text(commission.status, 175, yPos);

      yPos += 7;
    });

    // Footer
    pdf.setFontSize(8);
    pdf.text(
      `Generated on ${new Date().toLocaleString()}`,
      10,
      pdf.internal.pageSize.height - 10
    );

    // Save PDF
    pdf.save(filename);
  } catch (error) {
    console.error('Error generating commission statement PDF:', error);
    throw new Error('Failed to generate commission statement PDF');
  }
}
