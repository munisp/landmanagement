import puppeteer from 'puppeteer';
import { requireDb } from './db';
import { mortgageApplications, brokerCommissions, loanPools, poolInvestments } from '../drizzle/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

/**
 * Server-Side PDF Generation Service
 * Uses Puppeteer to render HTML templates with Chart.js and generate production-quality PDFs
 */

interface AnalyticsData {
  pipelineMetrics: {
    labels: string[];
    applications: number[];
    approvals: number[];
    disbursements: number[];
  };
  brokerPerformance: {
    labels: string[];
    commissions: number[];
    applications: number[];
  };
  investorROI: {
    labels: string[];
    returns: number[];
    investments: number[];
  };
  complianceScore: {
    score: number;
    categories: string[];
    scores: number[];
  };
}

interface CommissionStatementData {
  brokerId: string;
  brokerName: string;
  period: { start: Date; end: Date };
  totalCommission: number;
  commissions: Array<{
    date: Date;
    loanId: number;
    borrowerName: string;
    loanAmount: number;
    commissionAmount: number;
    status: string;
  }>;
}

/**
 * Fetch analytics data from database
 */
async function fetchAnalyticsData(
  startDate?: Date,
  endDate?: Date
): Promise<AnalyticsData> {
  const db = await requireDb();

  const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const end = endDate || new Date();

  // Pipeline metrics
  const applications = await db
    .select({
      month: sql<string>`TO_CHAR(${mortgageApplications.submittedAt}, 'YYYY-MM')`,
      total: sql<number>`COUNT(*)`,
      approved: sql<number>`SUM(CASE WHEN ${mortgageApplications.status} = 'approved' THEN 1 ELSE 0 END)`,
      disbursed: sql<number>`SUM(CASE WHEN ${mortgageApplications.status} = 'disbursed' THEN 1 ELSE 0 END)`,
    })
    .from(mortgageApplications)
    .where(
      and(
        gte(mortgageApplications.submittedAt, start),
        lte(mortgageApplications.submittedAt, end)
      )
    )
    .groupBy(sql`TO_CHAR(${mortgageApplications.submittedAt}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${mortgageApplications.submittedAt}, 'YYYY-MM')`);

  // Broker performance
  const brokerStats = await db
    .select({
      brokerId: brokerCommissions.brokerId,
      totalCommission: sql<number>`SUM(${brokerCommissions.commissionAmount})`,
      applicationCount: sql<number>`COUNT(DISTINCT ${brokerCommissions.applicationId})`,
    })
    .from(brokerCommissions)
    .where(
      and(
        gte(brokerCommissions.createdAt, start),
        lte(brokerCommissions.createdAt, end)
      )
    )
    .groupBy(brokerCommissions.brokerId)
    .limit(10);

  // Investor ROI
  const investorStats = await db
    .select({
      poolId: poolInvestments.poolId,
      totalInvestment: sql<number>`SUM(${poolInvestments.investmentAmount})`,
      totalReturn: sql<number>`SUM(${poolInvestments.investmentAmount} * ${poolInvestments.expectedReturnRate} / 100)`,
    })
    .from(poolInvestments)
    .where(
      and(
        gte(poolInvestments.investmentDate, start),
        lte(poolInvestments.investmentDate, end)
      )
    )
    .groupBy(poolInvestments.poolId)
    .limit(10);

  return {
    pipelineMetrics: {
      labels: applications.map((a) => a.month),
      applications: applications.map((a) => a.total),
      approvals: applications.map((a) => a.approved),
      disbursements: applications.map((a) => a.disbursed),
    },
    brokerPerformance: {
      labels: brokerStats.map((b) => `Broker ${b.brokerId}`),
      commissions: brokerStats.map((b) => b.totalCommission / 100),
      applications: brokerStats.map((b) => b.applicationCount),
    },
    investorROI: {
      labels: investorStats.map((i) => `Pool ${i.poolId}`),
      returns: investorStats.map((i) => i.totalReturn / 100),
      investments: investorStats.map((i) => i.totalInvestment / 100),
    },
    complianceScore: {
      score: 85,
      categories: ['Documentation', 'KYC', 'AML', 'Reporting', 'Data Security'],
      scores: [90, 85, 80, 88, 82],
    },
  };
}

/**
 * Fetch commission statement data
 */
async function fetchCommissionStatementData(
  brokerId: string,
  startDate: Date,
  endDate: Date
): Promise<CommissionStatementData> {
  const db = await requireDb();

  const commissions = await db
    .select()
    .from(brokerCommissions)
    .where(
      and(
        eq(brokerCommissions.brokerId, parseInt(brokerId)),
        gte(brokerCommissions.createdAt, startDate),
        lte(brokerCommissions.createdAt, endDate)
      )
    )
    .orderBy(brokerCommissions.createdAt);

  const totalCommission = commissions.reduce(
    (sum, c) => sum + c.commissionAmount,
    0
  );

  return {
    brokerId,
    brokerName: `Broker ${brokerId}`,
    period: { start: startDate, end: endDate },
    totalCommission: totalCommission / 100,
    commissions: commissions.map((c) => ({
      date: c.createdAt,
      loanId: c.applicationId,
      borrowerName: 'Borrower Name',
      loanAmount: c.loanAmount / 100,
      commissionAmount: c.commissionAmount / 100,
      status: c.status,
    })),
  };
}

/**
 * Generate HTML template for analytics report
 */
function generateAnalyticsHTML(data: AnalyticsData, filters: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Mortgage Analytics Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      margin: 40px;
      color: #333;
    }
    h1 {
      color: #1e40af;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 10px;
    }
    .header {
      margin-bottom: 30px;
    }
    .metadata {
      background: #f3f4f6;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .chart-container {
      margin: 30px 0;
      page-break-inside: avoid;
    }
    .chart-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 15px;
      color: #1f2937;
    }
    canvas {
      max-width: 100%;
      height: 300px !important;
    }
    .footer {
      margin-top: 50px;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Mortgage Analytics Report</h1>
    <div class="metadata">
      <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
      <p><strong>Period:</strong> ${filters.startDate || 'Last 90 days'} - ${filters.endDate || 'Today'}</p>
    </div>
  </div>

  <div class="chart-container">
    <div class="chart-title">Pipeline Metrics</div>
    <canvas id="pipelineChart"></canvas>
  </div>

  <div class="chart-container">
    <div class="chart-title">Broker Performance</div>
    <canvas id="brokerChart"></canvas>
  </div>

  <div class="chart-container">
    <div class="chart-title">Investor ROI</div>
    <canvas id="investorChart"></canvas>
  </div>

  <div class="chart-container">
    <div class="chart-title">Compliance Score</div>
    <canvas id="complianceChart"></canvas>
  </div>

  <div class="footer">
    <p>© 2026 IDLR Platform - Mortgage Analytics System</p>
  </div>

  <script>
    // Pipeline Chart
    new Chart(document.getElementById('pipelineChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(data.pipelineMetrics.labels)},
        datasets: [
          {
            label: 'Applications',
            data: ${JSON.stringify(data.pipelineMetrics.applications)},
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
          },
          {
            label: 'Approvals',
            data: ${JSON.stringify(data.pipelineMetrics.approvals)},
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
          },
          {
            label: 'Disbursements',
            data: ${JSON.stringify(data.pipelineMetrics.disbursements)},
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
        },
      },
    });

    // Broker Chart
    new Chart(document.getElementById('brokerChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(data.brokerPerformance.labels)},
        datasets: [
          {
            label: 'Total Commission ($)',
            data: ${JSON.stringify(data.brokerPerformance.commissions)},
            backgroundColor: '#3b82f6',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
        },
      },
    });

    // Investor Chart
    new Chart(document.getElementById('investorChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(data.investorROI.labels)},
        datasets: [
          {
            label: 'Investment ($)',
            data: ${JSON.stringify(data.investorROI.investments)},
            backgroundColor: '#10b981',
          },
          {
            label: 'Returns ($)',
            data: ${JSON.stringify(data.investorROI.returns)},
            backgroundColor: '#f59e0b',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
        },
      },
    });

    // Compliance Chart
    new Chart(document.getElementById('complianceChart'), {
      type: 'doughnut',
      data: {
        labels: ${JSON.stringify(data.complianceScore.categories)},
        datasets: [
          {
            data: ${JSON.stringify(data.complianceScore.scores)},
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' },
        },
      },
    });
  </script>
</body>
</html>
  `;
}

/**
 * Generate HTML template for commission statement
 */
function generateCommissionStatementHTML(data: CommissionStatementData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Commission Statement</title>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      margin: 40px;
      color: #333;
    }
    h1 {
      color: #1e40af;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 10px;
    }
    .header {
      margin-bottom: 30px;
    }
    .metadata {
      background: #f3f4f6;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .summary {
      background: #dbeafe;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .summary h2 {
      margin-top: 0;
      color: #1e40af;
    }
    .total {
      font-size: 32px;
      font-weight: bold;
      color: #1e40af;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background: #3b82f6;
      color: white;
      padding: 12px;
      text-align: left;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #e5e7eb;
    }
    tr:hover {
      background: #f9fafb;
    }
    .footer {
      margin-top: 50px;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Commission Statement</h1>
    <div class="metadata">
      <p><strong>Broker:</strong> ${data.brokerName} (${data.brokerId})</p>
      <p><strong>Period:</strong> ${data.period.start.toLocaleDateString()} - ${data.period.end.toLocaleDateString()}</p>
      <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    </div>
  </div>

  <div class="summary">
    <h2>Total Commission Earned</h2>
    <div class="total">$${data.totalCommission.toFixed(2)}</div>
    <p>${data.commissions.length} transactions</p>
  </div>

  <h2>Commission Details</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Loan ID</th>
        <th>Borrower</th>
        <th>Commission</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${data.commissions
        .map(
          (c) => `
        <tr>
          <td>${c.date.toLocaleDateString()}</td>
          <td>${c.loanId}</td>
          <td>${c.borrowerName}</td>
          <td>$${c.commissionAmount.toFixed(2)}</td>
          <td>${c.status}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>© 2026 IDLR Platform - Mortgage Broker Commission System</p>
  </div>
</body>
</html>
  `;
}

/**
 * Generate PDF from HTML using Puppeteer
 */
async function generatePDFFromHTML(
  html: string,
  filename: string
): Promise<{ buffer: Buffer; filename: string }> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Wait for charts to render
    await new Promise(resolve => setTimeout(resolve, 2000));

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
    });

    return {
      buffer: Buffer.from(pdfBuffer),
      filename,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Generate analytics report PDF
 */
export async function generateAnalyticsReportPDF(
  filters: any
): Promise<{ buffer: Buffer; filename: string }> {
  const data = await fetchAnalyticsData(
    filters.startDate ? new Date(filters.startDate) : undefined,
    filters.endDate ? new Date(filters.endDate) : undefined
  );

  const html = generateAnalyticsHTML(data, filters);
  const filename = `analytics-report-${Date.now()}.pdf`;

  return generatePDFFromHTML(html, filename);
}

/**
 * Generate commission statement PDF
 */
export async function generateCommissionStatementPDF(
  brokerId: string,
  startDate: Date,
  endDate: Date
): Promise<{ buffer: Buffer; filename: string }> {
  const data = await fetchCommissionStatementData(brokerId, startDate, endDate);
  const html = generateCommissionStatementHTML(data);
  const filename = `commission-statement-${brokerId}-${Date.now()}.pdf`;

  return generatePDFFromHTML(html, filename);
}
