/**
 * Financial Integrations Service
 * Integrates with banks, payment gateways, and financial institutions
 */

import axios from 'axios';

function requiredFinancialConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for financial integrations`);
  return value;
}

// ============================================
// BANK API INTEGRATION
// ============================================

interface BankAccount {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
  balance?: number;
}

interface BankTransferRequest {
  sourceAccount: string;
  destinationAccount: string;
  amount: number;
  currency: string;
  narration: string;
  reference: string;
}

interface BankTransferResponse {
  success: boolean;
  reference: string;
  transactionId: string;
  status: 'pending' | 'success' | 'failed';
  message: string;
}

/**
 * Verify bank account details
 */
export async function verifyBankAccount(
  accountNumber: string,
  bankCode: string
): Promise<BankAccount> {
  try {
    // Integration with Nigerian bank verification API (e.g., Paystack, Flutterwave)
    const response = await axios.post(
      `${process.env.BANK_API_URL}/verify-account`,
      {
        account_number: accountNumber,
        bank_code: bankCode,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.BANK_API_KEY}`,
        },
      }
    );

    return {
      accountNumber,
      accountName: response.data.account_name,
      bankCode,
      bankName: response.data.bank_name,
    };
  } catch (error: any) {
    throw new Error(`Bank account verification failed: ${error.message}`);
  }
}

/**
 * Initiate bank transfer
 */
export async function initiateBankTransfer(
  request: BankTransferRequest
): Promise<BankTransferResponse> {
  try {
    const response = await axios.post(
      `${process.env.BANK_API_URL}/transfer`,
      {
        source_account: request.sourceAccount,
        destination_account: request.destinationAccount,
        amount: request.amount,
        currency: request.currency,
        narration: request.narration,
        reference: request.reference,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.BANK_API_KEY}`,
        },
      }
    );

    return {
      success: response.data.status === 'success',
      reference: request.reference,
      transactionId: response.data.transaction_id,
      status: response.data.status,
      message: response.data.message,
    };
  } catch (error: any) {
    return {
      success: false,
      reference: request.reference,
      transactionId: '',
      status: 'failed',
      message: error.message,
    };
  }
}

/**
 * Get bank account balance
 */
export async function getBankAccountBalance(
  accountNumber: string,
  bankCode: string
): Promise<number> {
  try {
    const response = await axios.get(
      `${process.env.BANK_API_URL}/balance`,
      {
        params: {
          account_number: accountNumber,
          bank_code: bankCode,
        },
        headers: {
          Authorization: `Bearer ${process.env.BANK_API_KEY}`,
        },
      }
    );

    return parseFloat(response.data.balance);
  } catch (error: any) {
    throw new Error(`Failed to fetch balance: ${error.message}`);
  }
}

// ============================================
// PAYSTACK INTEGRATION
// ============================================

interface PaystackPaymentRequest {
  email: string;
  amount: number; // in kobo (multiply by 100)
  reference: string;
  callback_url?: string;
  metadata?: any;
}

interface PaystackPaymentResponse {
  success: boolean;
  authorization_url: string;
  access_code: string;
  reference: string;
}

/**
 * Initialize Paystack payment
 */
export async function initializePaystackPayment(
  request: PaystackPaymentRequest
): Promise<PaystackPaymentResponse> {
  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: request.email,
        amount: Math.round(request.amount * 100), // Convert to kobo
        reference: request.reference,
        callback_url: request.callback_url,
        metadata: request.metadata,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: response.data.status,
      authorization_url: response.data.data.authorization_url,
      access_code: response.data.data.access_code,
      reference: response.data.data.reference,
    };
  } catch (error: any) {
    throw new Error(`Paystack initialization failed: ${error.message}`);
  }
}

/**
 * Verify Paystack payment
 */
export async function verifyPaystackPayment(reference: string): Promise<{
  success: boolean;
  amount: number;
  status: string;
  paid_at: string;
}> {
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    return {
      success: response.data.data.status === 'success',
      amount: response.data.data.amount / 100, // Convert from kobo
      status: response.data.data.status,
      paid_at: response.data.data.paid_at,
    };
  } catch (error: any) {
    throw new Error(`Paystack verification failed: ${error.message}`);
  }
}

// ============================================
// FLUTTERWAVE INTEGRATION
// ============================================

interface FlutterwavePaymentRequest {
  email: string;
  amount: number;
  currency: string;
  tx_ref: string;
  redirect_url?: string;
  customer: {
    email: string;
    name: string;
    phonenumber?: string;
  };
}

interface FlutterwavePaymentResponse {
  success: boolean;
  payment_link: string;
  tx_ref: string;
}

/**
 * Initialize Flutterwave payment
 */
export async function initializeFlutterwavePayment(
  request: FlutterwavePaymentRequest
): Promise<FlutterwavePaymentResponse> {
  try {
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      {
        tx_ref: request.tx_ref,
        amount: request.amount,
        currency: request.currency,
        redirect_url: request.redirect_url,
        customer: request.customer,
        customizations: {
          title: 'IDLR Property Payment',
          description: 'Payment for property transaction',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: response.data.status === 'success',
      payment_link: response.data.data.link,
      tx_ref: request.tx_ref,
    };
  } catch (error: any) {
    throw new Error(`Flutterwave initialization failed: ${error.message}`);
  }
}

/**
 * Verify Flutterwave payment
 */
export async function verifyFlutterwavePayment(transactionId: string): Promise<{
  success: boolean;
  amount: number;
  currency: string;
  status: string;
}> {
  try {
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    return {
      success: response.data.data.status === 'successful',
      amount: response.data.data.amount,
      currency: response.data.data.currency,
      status: response.data.data.status,
    };
  } catch (error: any) {
    throw new Error(`Flutterwave verification failed: ${error.message}`);
  }
}

// ============================================
// MORTGAGE LOAN PROCESSING
// ============================================

interface MortgageLoanApplication {
  userId: number;
  propertyId: number;
  loanAmount: number;
  interestRate: number;
  loanTerm: number; // in months
  monthlyIncome: number;
  employmentStatus: string;
  creditScore?: number;
}

interface MortgageLoanResponse {
  applicationId: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedAmount?: number;
  monthlyPayment?: number;
  message: string;
}

/**
 * Submit mortgage loan application
 */
export async function submitMortgageLoanApplication(
  application: MortgageLoanApplication
): Promise<MortgageLoanResponse> {
  try {
    // Calculate monthly payment
    const monthlyRate = application.interestRate / 100 / 12;
    const monthlyPayment =
      (application.loanAmount *
        monthlyRate *
        Math.pow(1 + monthlyRate, application.loanTerm)) /
      (Math.pow(1 + monthlyRate, application.loanTerm) - 1);

    // Check affordability (monthly payment should not exceed 30% of income)
    const affordabilityRatio = monthlyPayment / application.monthlyIncome;

    if (affordabilityRatio > 0.3) {
      return {
        applicationId: `MORT-${Date.now()}`,
        status: 'rejected',
        message: 'Loan amount exceeds affordability threshold (30% of monthly income)',
      };
    }

    // Integration with bank mortgage API
    const response = await axios.post(
      `${process.env.BANK_API_URL}/mortgage/apply`,
      {
        user_id: application.userId,
        property_id: application.propertyId,
        loan_amount: application.loanAmount,
        interest_rate: application.interestRate,
        loan_term: application.loanTerm,
        monthly_income: application.monthlyIncome,
        employment_status: application.employmentStatus,
        credit_score: application.creditScore,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.BANK_API_KEY}`,
        },
      }
    );

    return {
      applicationId: response.data.application_id,
      status: response.data.status,
      approvedAmount: response.data.approved_amount,
      monthlyPayment: response.data.monthly_payment,
      message: response.data.message,
    };
  } catch (error: any) {
    return {
      applicationId: `MORT-${Date.now()}`,
      status: 'pending',
      message: `Application submitted for review: ${error.message}`,
    };
  }
}

/**
 * Check mortgage loan application status
 */
export async function checkMortgageLoanStatus(
  applicationId: string
): Promise<MortgageLoanResponse> {
  try {
    const response = await axios.get(
      `${process.env.BANK_API_URL}/mortgage/status/${applicationId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.BANK_API_KEY}`,
        },
      }
    );

    return {
      applicationId,
      status: response.data.status,
      approvedAmount: response.data.approved_amount,
      monthlyPayment: response.data.monthly_payment,
      message: response.data.message,
    };
  } catch (error: any) {
    throw new Error(`Failed to check loan status: ${error.message}`);
  }
}

// ============================================
// CREDIT SCORE CHECK
// ============================================

interface CreditScoreResponse {
  score: number;
  rating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  factors: string[];
}

/**
 * Get user credit score
 */
export async function getCreditScore(userId: number): Promise<CreditScoreResponse> {
  try {
    const baseUrl = requiredFinancialConfig('CREDIT_BUREAU_API_URL').replace(/\/$/, '');
    const apiKey = requiredFinancialConfig('CREDIT_BUREAU_API_KEY');
    const response = await axios.get(`${baseUrl}/score/${userId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15_000,
    });
    return {
      score: response.data.score,
      rating: response.data.rating,
      factors: response.data.factors,
    };
  } catch (error: any) {
    throw new Error(`Credit-bureau lookup failed: ${error.message}`);
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate unique payment reference
 */
export function generatePaymentReference(prefix: string = 'IDLR'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
}

/**
 * Calculate loan affordability
 */
export function calculateLoanAffordability(
  monthlyIncome: number,
  loanAmount: number,
  interestRate: number,
  loanTerm: number
): {
  monthlyPayment: number;
  affordabilityRatio: number;
  isAffordable: boolean;
} {
  const monthlyRate = interestRate / 100 / 12;
  const monthlyPayment =
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) /
    (Math.pow(1 + monthlyRate, loanTerm) - 1);

  const affordabilityRatio = monthlyPayment / monthlyIncome;

  return {
    monthlyPayment,
    affordabilityRatio,
    isAffordable: affordabilityRatio <= 0.3,
  };
}
