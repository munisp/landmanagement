/**
 * FIRS (Federal Inland Revenue Service) Integration
 * Handles property tax calculation, verification, and payment processing
 */

import axios from 'axios';

// FIRS API endpoint (can be configured via environment variable)
const FIRS_API_URL = process.env.FIRS_API_URL || 'https://api.firs.gov.ng/v1';
const FIRS_API_KEY = process.env.FIRS_API_KEY || '';

export interface PropertyTaxCalculation {
  parcelId: string;
  propertyValue: number;
  landArea: number; // in square meters
  landUseType: 'residential' | 'commercial' | 'industrial' | 'agricultural' | 'mixed';
  state: string;
  lga: string;
}

export interface TaxAssessment {
  assessmentId: string;
  parcelId: string;
  taxYear: number;
  propertyValue: number;
  assessedValue: number;
  taxRate: number;
  annualTax: number;
  penalties: number;
  totalDue: number;
  dueDate: Date;
  status: 'pending' | 'paid' | 'overdue' | 'disputed';
  assessmentDate: Date;
}

export interface TaxPayment {
  paymentId: string;
  assessmentId: string;
  amount: number;
  paymentMethod: 'bank_transfer' | 'card' | 'ussd' | 'pos';
  paymentDate: Date;
  receiptNumber: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface TaxClearance {
  certificateId: string;
  parcelId: string;
  ownerName: string;
  ownerTin: string;
  validFrom: Date;
  validUntil: Date;
  status: 'valid' | 'expired' | 'revoked';
  issueDate: Date;
  certificateUrl: string;
}

/**
 * Calculate property tax based on property details
 */
export async function calculatePropertyTax(data: PropertyTaxCalculation): Promise<TaxAssessment> {
  try {
    const response = await axios.post(
      `${FIRS_API_URL}/property-tax/calculate`,
      data,
      {
        headers: {
          'Authorization': `Bearer ${FIRS_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      assessmentId: response.data.assessment_id,
      parcelId: data.parcelId,
      taxYear: new Date().getFullYear(),
      propertyValue: data.propertyValue,
      assessedValue: response.data.assessed_value,
      taxRate: response.data.tax_rate,
      annualTax: response.data.annual_tax,
      penalties: response.data.penalties || 0,
      totalDue: response.data.total_due,
      dueDate: new Date(response.data.due_date),
      status: response.data.status,
      assessmentDate: new Date(response.data.assessment_date),
    };
  } catch (error) {
    console.error('Error calculating property tax:', error);
    throw new Error('Failed to calculate property tax');
  }
}

/**
 * Get tax assessment by ID
 */
export async function getTaxAssessment(assessmentId: string): Promise<TaxAssessment> {
  try {
    const response = await axios.get(
      `${FIRS_API_URL}/property-tax/assessments/${assessmentId}`,
      {
        headers: {
          'Authorization': `Bearer ${FIRS_API_KEY}`,
        },
      }
    );

    return {
      assessmentId: response.data.assessment_id,
      parcelId: response.data.parcel_id,
      taxYear: response.data.tax_year,
      propertyValue: response.data.property_value,
      assessedValue: response.data.assessed_value,
      taxRate: response.data.tax_rate,
      annualTax: response.data.annual_tax,
      penalties: response.data.penalties || 0,
      totalDue: response.data.total_due,
      dueDate: new Date(response.data.due_date),
      status: response.data.status,
      assessmentDate: new Date(response.data.assessment_date),
    };
  } catch (error) {
    console.error('Error getting tax assessment:', error);
    throw new Error('Failed to get tax assessment');
  }
}

/**
 * Get tax history for a parcel
 */
export async function getTaxHistory(parcelId: string): Promise<TaxAssessment[]> {
  try {
    const response = await axios.get(
      `${FIRS_API_URL}/property-tax/history/${parcelId}`,
      {
        headers: {
          'Authorization': `Bearer ${FIRS_API_KEY}`,
        },
      }
    );

    return response.data.assessments.map((item: any) => ({
      assessmentId: item.assessment_id,
      parcelId: item.parcel_id,
      taxYear: item.tax_year,
      propertyValue: item.property_value,
      assessedValue: item.assessed_value,
      taxRate: item.tax_rate,
      annualTax: item.annual_tax,
      penalties: item.penalties || 0,
      totalDue: item.total_due,
      dueDate: new Date(item.due_date),
      status: item.status,
      assessmentDate: new Date(item.assessment_date),
    }));
  } catch (error) {
    console.error('Error getting tax history:', error);
    throw new Error('Failed to get tax history');
  }
}

/**
 * Submit tax payment
 */
export async function submitTaxPayment(
  assessmentId: string,
  amount: number,
  paymentMethod: string
): Promise<TaxPayment> {
  try {
    const response = await axios.post(
      `${FIRS_API_URL}/property-tax/payments`,
      {
        assessment_id: assessmentId,
        amount,
        payment_method: paymentMethod,
      },
      {
        headers: {
          'Authorization': `Bearer ${FIRS_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      paymentId: response.data.payment_id,
      assessmentId,
      amount,
      paymentMethod: paymentMethod as any,
      paymentDate: new Date(response.data.payment_date),
      receiptNumber: response.data.receipt_number,
      status: response.data.status,
    };
  } catch (error) {
    console.error('Error submitting tax payment:', error);
    throw new Error('Failed to submit tax payment');
  }
}

/**
 * Verify TIN (Tax Identification Number)
 */
export async function verifyTIN(tin: string): Promise<{
  valid: boolean;
  taxpayerName?: string;
  taxpayerType?: string;
  registrationDate?: Date;
}> {
  try {
    const response = await axios.get(
      `${FIRS_API_URL}/taxpayers/verify/${tin}`,
      {
        headers: {
          'Authorization': `Bearer ${FIRS_API_KEY}`,
        },
      }
    );

    return {
      valid: response.data.valid,
      taxpayerName: response.data.taxpayer_name,
      taxpayerType: response.data.taxpayer_type,
      registrationDate: response.data.registration_date ? new Date(response.data.registration_date) : undefined,
    };
  } catch (error) {
    console.error('Error verifying TIN:', error);
    return { valid: false };
  }
}

/**
 * Generate tax clearance certificate
 */
export async function generateTaxClearance(
  parcelId: string,
  ownerName: string,
  ownerTin: string
): Promise<TaxClearance> {
  try {
    const response = await axios.post(
      `${FIRS_API_URL}/property-tax/clearance`,
      {
        parcel_id: parcelId,
        owner_name: ownerName,
        owner_tin: ownerTin,
      },
      {
        headers: {
          'Authorization': `Bearer ${FIRS_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      certificateId: response.data.certificate_id,
      parcelId,
      ownerName,
      ownerTin,
      validFrom: new Date(response.data.valid_from),
      validUntil: new Date(response.data.valid_until),
      status: response.data.status,
      issueDate: new Date(response.data.issue_date),
      certificateUrl: response.data.certificate_url,
    };
  } catch (error) {
    console.error('Error generating tax clearance:', error);
    throw new Error('Failed to generate tax clearance certificate');
  }
}

/**
 * Verify tax clearance certificate
 */
export async function verifyTaxClearance(certificateId: string): Promise<TaxClearance> {
  try {
    const response = await axios.get(
      `${FIRS_API_URL}/property-tax/clearance/${certificateId}`,
      {
        headers: {
          'Authorization': `Bearer ${FIRS_API_KEY}`,
        },
      }
    );

    return {
      certificateId: response.data.certificate_id,
      parcelId: response.data.parcel_id,
      ownerName: response.data.owner_name,
      ownerTin: response.data.owner_tin,
      validFrom: new Date(response.data.valid_from),
      validUntil: new Date(response.data.valid_until),
      status: response.data.status,
      issueDate: new Date(response.data.issue_date),
      certificateUrl: response.data.certificate_url,
    };
  } catch (error) {
    console.error('Error verifying tax clearance:', error);
    throw new Error('Failed to verify tax clearance certificate');
  }
}

/**
 * Mock implementations for development/testing
 */
export async function calculatePropertyTaxMock(data: PropertyTaxCalculation): Promise<TaxAssessment> {
  // Tax rate varies by land use type
  const taxRates = {
    residential: 0.005, // 0.5%
    commercial: 0.01,   // 1.0%
    industrial: 0.015,  // 1.5%
    agricultural: 0.002, // 0.2%
    mixed: 0.0075,      // 0.75%
  };

  const taxRate = taxRates[data.landUseType];
  const assessedValue = data.propertyValue * 0.9; // 90% of market value
  const annualTax = assessedValue * taxRate;
  const penalties = 0;
  const totalDue = annualTax + penalties;

  return {
    assessmentId: `ASM${Date.now()}`,
    parcelId: data.parcelId,
    taxYear: new Date().getFullYear(),
    propertyValue: data.propertyValue,
    assessedValue,
    taxRate,
    annualTax,
    penalties,
    totalDue,
    dueDate: new Date(new Date().setMonth(new Date().getMonth() + 3)), // 3 months from now
    status: 'pending',
    assessmentDate: new Date(),
  };
}

export async function getTaxHistoryMock(parcelId: string): Promise<TaxAssessment[]> {
  const currentYear = new Date().getFullYear();
  const history: TaxAssessment[] = [];

  for (let i = 0; i < 3; i++) {
    const year = currentYear - i;
    history.push({
      assessmentId: `ASM${year}${parcelId}`,
      parcelId,
      taxYear: year,
      propertyValue: 50000000 + (i * 2000000),
      assessedValue: 45000000 + (i * 1800000),
      taxRate: 0.005,
      annualTax: 225000 + (i * 9000),
      penalties: i === 0 ? 0 : 10000,
      totalDue: i === 0 ? 225000 : 235000,
      dueDate: new Date(year, 11, 31),
      status: i === 0 ? 'pending' : 'paid',
      assessmentDate: new Date(year, 0, 1),
    });
  }

  return history;
}

export async function submitTaxPaymentMock(
  assessmentId: string,
  amount: number,
  paymentMethod: string
): Promise<TaxPayment> {
  return {
    paymentId: `PAY${Date.now()}`,
    assessmentId,
    amount,
    paymentMethod: paymentMethod as any,
    paymentDate: new Date(),
    receiptNumber: `RCP${Date.now()}`,
    status: 'completed',
  };
}

export async function generateTaxClearanceMock(
  parcelId: string,
  ownerName: string,
  ownerTin: string
): Promise<TaxClearance> {
  const now = new Date();
  const validUntil = new Date(now);
  validUntil.setFullYear(validUntil.getFullYear() + 1);

  return {
    certificateId: `TCC${Date.now()}`,
    parcelId,
    ownerName,
    ownerTin,
    validFrom: now,
    validUntil,
    status: 'valid',
    issueDate: now,
    certificateUrl: `https://storage.example.com/tax-clearance/TCC${Date.now()}.pdf`,
  };
}
