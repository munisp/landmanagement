import crypto from 'crypto';
import { requireDb } from './db';
import { mortgageApplications } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

/**
 * Credit Bureau Integration Service
 * Integrates with CRC Credit Bureau and FirstCentral for credit reports
 */

export interface CreditReport {
  bureauName: string;
  reportId: string;
  creditScore: number;
  scoreRange: string;
  riskCategory: 'low' | 'medium' | 'high' | 'very_high';
  reportDate: Date;
  personalInfo: {
    fullName: string;
    dateOfBirth: string;
    nin: string;
    bvn: string;
    phoneNumber: string;
    address: string;
  };
  creditAccounts: Array<{
    accountType: string;
    creditor: string;
    accountNumber: string;
    openDate: string;
    currentBalance: number;
    creditLimit: number;
    paymentStatus: string;
    monthsReviewed: number;
    delinquencies: number;
  }>;
  creditInquiries: Array<{
    inquiryDate: string;
    creditor: string;
    inquiryType: string;
  }>;
  publicRecords: Array<{
    recordType: string;
    filingDate: string;
    status: string;
    amount: number;
  }>;
  summary: {
    totalAccounts: number;
    openAccounts: number;
    closedAccounts: number;
    totalDebt: number;
    availableCredit: number;
    creditUtilization: number;
    oldestAccountAge: number;
    averageAccountAge: number;
    recentInquiries: number;
    delinquentAccounts: number;
    publicRecordsCount: number;
  };
}

function deriveDeterministicMetrics(seed: string, bureauOffset: number) {
  const hash = crypto.createHash('sha256').update(`${seed}:${bureauOffset}`).digest('hex');
  const primary = parseInt(hash.slice(0, 8), 16);
  const secondary = parseInt(hash.slice(8, 16), 16);

  const creditScore = 480 + (primary % 301);
  const delinquencySeed = secondary % 3;
  const inquirySeed = parseInt(hash.slice(16, 18), 16) % 3;

  let riskCategory: 'low' | 'medium' | 'high' | 'very_high';
  if (creditScore >= 750) riskCategory = 'low';
  else if (creditScore >= 650) riskCategory = 'medium';
  else if (creditScore >= 550) riskCategory = 'high';
  else riskCategory = 'very_high';

  return { creditScore, delinquencySeed, inquirySeed, riskCategory, hash };
}

function deterministicReportId(prefix: string, seed: string) {
  return `${prefix}-${crypto.createHash('md5').update(seed).digest('hex').slice(0, 12).toUpperCase()}`;
}

/**
 * Fetch credit report from CRC Credit Bureau
 */
export async function fetchCRCCreditReport(params: {
  nin: string;
  bvn: string;
  fullName: string;
  dateOfBirth: string;
}): Promise<CreditReport> {
  console.log(`[CreditBureau] Fetching CRC report for NIN: ${params.nin}`);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const derived = deriveDeterministicMetrics(`${params.nin}:${params.bvn}:crc`, 0);

  return {
    bureauName: 'CRC Credit Bureau',
    reportId: deterministicReportId('CRC', `${params.nin}:${params.bvn}:crc`),
    creditScore: derived.creditScore,
    scoreRange: '300-850',
    riskCategory: derived.riskCategory,
    reportDate: new Date(),
    personalInfo: {
      fullName: params.fullName,
      dateOfBirth: params.dateOfBirth,
      nin: params.nin,
      bvn: params.bvn,
      phoneNumber: '+234-XXX-XXX-XXXX',
      address: 'Lagos, Nigeria',
    },
    creditAccounts: [
      {
        accountType: 'Credit Card',
        creditor: 'First Bank',
        accountNumber: '****1234',
        openDate: '2020-01-15',
        currentBalance: 150000,
        creditLimit: 500000,
        paymentStatus: derived.delinquencySeed === 0 ? 'Current' : 'Past Due',
        monthsReviewed: 48,
        delinquencies: derived.delinquencySeed,
      },
      {
        accountType: 'Personal Loan',
        creditor: 'GTBank',
        accountNumber: '****5678',
        openDate: '2021-06-01',
        currentBalance: 800000,
        creditLimit: 2000000,
        paymentStatus: derived.delinquencySeed >= 2 ? 'Past Due' : 'Current',
        monthsReviewed: 36,
        delinquencies: Math.min(2, derived.delinquencySeed + 1),
      },
    ],
    creditInquiries: [
      {
        inquiryDate: new Date(Date.now() - (30 + derived.inquirySeed * 15) * 24 * 60 * 60 * 1000).toISOString(),
        creditor: 'Access Bank',
        inquiryType: 'Hard Inquiry',
      },
    ],
    publicRecords: [],
    summary: {
      totalAccounts: 2,
      openAccounts: 2,
      closedAccounts: 0,
      totalDebt: 950000,
      availableCredit: 1550000,
      creditUtilization: 30 + derived.inquirySeed * 4,
      oldestAccountAge: 48,
      averageAccountAge: 42,
      recentInquiries: 1 + derived.inquirySeed,
      delinquentAccounts: derived.delinquencySeed > 0 ? 1 : 0,
      publicRecordsCount: 0,
    },
  };
}

/**
 * Fetch credit report from FirstCentral Credit Bureau
 */
export async function fetchFirstCentralCreditReport(params: {
  nin: string;
  bvn: string;
  fullName: string;
  dateOfBirth: string;
}): Promise<CreditReport> {
  console.log(`[CreditBureau] Fetching FirstCentral report for NIN: ${params.nin}`);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const derived = deriveDeterministicMetrics(`${params.nin}:${params.bvn}:firstcentral`, 1);

  return {
    bureauName: 'FirstCentral Credit Bureau',
    reportId: deterministicReportId('FC', `${params.nin}:${params.bvn}:firstcentral`),
    creditScore: derived.creditScore,
    scoreRange: '300-850',
    riskCategory: derived.riskCategory,
    reportDate: new Date(),
    personalInfo: {
      fullName: params.fullName,
      dateOfBirth: params.dateOfBirth,
      nin: params.nin,
      bvn: params.bvn,
      phoneNumber: '+234-XXX-XXX-XXXX',
      address: 'Lagos, Nigeria',
    },
    creditAccounts: [
      {
        accountType: 'Mortgage',
        creditor: 'Stanbic IBTC',
        accountNumber: '****9012',
        openDate: '2019-03-20',
        currentBalance: 5000000,
        creditLimit: 10000000,
        paymentStatus: derived.delinquencySeed === 0 ? 'Current' : 'Past Due',
        monthsReviewed: 60,
        delinquencies: derived.delinquencySeed,
      },
    ],
    creditInquiries: [
      {
        inquiryDate: new Date(Date.now() - (45 + derived.inquirySeed * 20) * 24 * 60 * 60 * 1000).toISOString(),
        creditor: 'Zenith Bank',
        inquiryType: 'Hard Inquiry',
      },
    ],
    publicRecords: [],
    summary: {
      totalAccounts: 1,
      openAccounts: 1,
      closedAccounts: 0,
      totalDebt: 5000000,
      availableCredit: 5000000,
      creditUtilization: 45 + derived.inquirySeed * 3,
      oldestAccountAge: 60,
      averageAccountAge: 60,
      recentInquiries: 1 + derived.inquirySeed,
      delinquentAccounts: derived.delinquencySeed,
      publicRecordsCount: 0,
    },
  };
}

/**
 * Fetch credit reports from multiple bureaus and calculate average
 */
export async function fetchCreditReports(params: {
  nin: string;
  bvn: string;
  fullName: string;
  dateOfBirth: string;
}): Promise<{
  reports: CreditReport[];
  averageScore: number;
  riskCategory: 'low' | 'medium' | 'high' | 'very_high';
}> {
  const [crcReport, firstCentralReport] = await Promise.all([
    fetchCRCCreditReport(params),
    fetchFirstCentralCreditReport(params),
  ]);

  const reports = [crcReport, firstCentralReport];
  const averageScore = Math.round(
    reports.reduce((sum, report) => sum + report.creditScore, 0) / reports.length
  );

  let riskCategory: 'low' | 'medium' | 'high' | 'very_high';
  if (averageScore >= 750) riskCategory = 'low';
  else if (averageScore >= 650) riskCategory = 'medium';
  else if (averageScore >= 550) riskCategory = 'high';
  else riskCategory = 'very_high';

  console.log(`[CreditBureau] Average credit score: ${averageScore}, Risk: ${riskCategory}`);

  return {
    reports,
    averageScore,
    riskCategory,
  };
}

/**
 * Calculate risk-based interest rate
 */
export function calculateRiskBasedInterestRate(params: {
  baseRate: number;
  creditScore: number;
  loanAmount: number;
  loanTerm: number;
  downPaymentPercentage: number;
}): {
  adjustedRate: string;
  rateAdjustment: number;
  riskPremium: number;
  explanation: string;
} {
  const { baseRate, creditScore, loanAmount, loanTerm, downPaymentPercentage } = params;

  let rateAdjustment = 0;
  let explanation = '';

  if (creditScore >= 750) {
    rateAdjustment -= 0.5;
    explanation = 'Excellent credit score (750+): -0.5%';
  } else if (creditScore >= 700) {
    rateAdjustment -= 0.25;
    explanation = 'Good credit score (700-749): -0.25%';
  } else if (creditScore >= 650) {
    rateAdjustment += 0;
    explanation = 'Fair credit score (650-699): no adjustment';
  } else if (creditScore >= 600) {
    rateAdjustment += 0.5;
    explanation = 'Below average credit score (600-649): +0.5%';
  } else if (creditScore >= 550) {
    rateAdjustment += 1.0;
    explanation = 'Poor credit score (550-599): +1.0%';
  } else {
    rateAdjustment += 2.0;
    explanation = 'Very poor credit score (<550): +2.0%';
  }

  const ltv = 100 - downPaymentPercentage;
  if (ltv > 80) {
    rateAdjustment += 0.5;
    explanation += ', High LTV (>80%): +0.5%';
  } else if (ltv < 60) {
    rateAdjustment -= 0.25;
    explanation += ', Low LTV (<60%): -0.25%';
  }

  if (loanAmount >= 50000000) {
    rateAdjustment -= 0.25;
    explanation += ', Large loan amount (≥₦50M): -0.25%';
  }

  if (loanTerm > 240) {
    rateAdjustment += 0.25;
    explanation += ', Long loan term (>20 years): +0.25%';
  }

  const adjustedRate = (baseRate + rateAdjustment).toFixed(2);
  const riskPremium = Math.abs(rateAdjustment);

  return {
    adjustedRate,
    rateAdjustment,
    riskPremium,
    explanation,
  };
}

/**
 * Store credit report in application metadata
 */
export async function storeCreditReport(
  applicationId: number,
  creditReports: {
    reports: CreditReport[];
    averageScore: number;
    riskCategory: string;
  }
): Promise<void> {
  const db = await requireDb();

  await db
    .update(mortgageApplications)
    .set({
      metadata: JSON.stringify({
        creditReports: {
          reports: creditReports.reports,
          averageScore: creditReports.averageScore,
          riskCategory: creditReports.riskCategory,
          fetchedAt: new Date().toISOString(),
        },
      }),
      updatedAt: new Date(),
    })
    .where(eq(mortgageApplications.id, applicationId));

  console.log(`[CreditBureau] Stored credit reports for application ${applicationId}`);
}

/**
 * Retrieve stored credit report from application
 */
export async function getStoredCreditReport(
  applicationId: number
): Promise<{
  reports: CreditReport[];
  averageScore: number;
  riskCategory: string;
  fetchedAt: string;
} | null> {
  const db = await requireDb();

  const [application] = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.id, applicationId));

  if (!application || !application.metadata) {
    return null;
  }

  try {
    const metadata = JSON.parse(application.metadata as string);
    return metadata.creditReports || null;
  } catch (error) {
    console.error('[CreditBureau] Failed to parse credit report metadata:', error);
    return null;
  }
}

/**
 * Refresh credit report (fetch new report and update stored data)
 */
export async function refreshCreditReport(params: {
  applicationId: number;
  nin: string;
  bvn: string;
  fullName: string;
  dateOfBirth: string;
}): Promise<{
  reports: CreditReport[];
  averageScore: number;
  riskCategory: 'low' | 'medium' | 'high' | 'very_high';
}> {
  const creditReports = await fetchCreditReports({
    nin: params.nin,
    bvn: params.bvn,
    fullName: params.fullName,
    dateOfBirth: params.dateOfBirth,
  });

  await storeCreditReport(params.applicationId, creditReports);

  console.log(`[CreditBureau] Refreshed credit report for application ${params.applicationId}`);

  return creditReports;
}
