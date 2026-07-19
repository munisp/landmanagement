/**
 * Advanced Reporting System
 * Customizable report builder with scheduling and export capabilities
 */

import { format as formatDate } from 'date-fns';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { sql } from 'drizzle-orm';
import { requireDb } from './db';
import { sendEmail } from './emailService';
import { storagePut } from './storage';

export interface ReportConfig {
  id: string;
  name: string;
  description: string;
  type: 'transaction' | 'parcel' | 'revenue' | 'custom';
  filters: ReportFilter[];
  columns: ReportColumn[];
  groupBy?: string[];
  sortBy?: { field: string; order: 'asc' | 'desc' }[];
  schedule?: ReportSchedule;
  recipients?: string[];
  format: 'pdf' | 'excel' | 'csv' | 'json';
}

export interface ReportFilter {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'between' | 'in';
  value: any;
}

export interface ReportColumn {
  field: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'currency' | 'boolean';
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  format?: string;
}

export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  time: string; // HH:mm format
  timezone: string;
}

export interface ReportResult {
  reportId: string;
  generatedAt: Date;
  data: any[];
  summary: {
    totalRecords: number;
    aggregations?: Record<string, number>;
  };
  exportUrl?: string;
}

/**
 * Report Builder Service
 */
export class ReportBuilder {
  private config: ReportConfig;
  
  constructor(config: ReportConfig) {
    this.config = config;
  }

  /**
   * Generate report based on configuration
   */
  async generate(): Promise<ReportResult> {
    const startTime = Date.now();
    
    // Build query based on filters
    const query = this.buildQuery();
    
    // Execute query
    const data = await this.executeQuery(query);
    
    // Apply grouping if specified
    const groupedData = this.config.groupBy 
      ? this.applyGrouping(data, this.config.groupBy)
      : data;
    
    // Apply sorting
    const sortedData = this.config.sortBy
      ? this.applySorting(groupedData, this.config.sortBy)
      : groupedData;
    
    // Calculate aggregations
    const aggregations = this.calculateAggregations(sortedData);
    
    // Format data based on column definitions
    const formattedData = this.formatData(sortedData);
    
    const result: ReportResult = {
      reportId: this.config.id,
      generatedAt: new Date(),
      data: formattedData,
      summary: {
        totalRecords: formattedData.length,
        aggregations,
      },
    };
    
    // Export if format specified
    if (this.config.format) {
      result.exportUrl = await this.exportReport(result);
    }
    
    console.log(`Report generated in ${Date.now() - startTime}ms`);
    
    return result;
  }

  /**
   * Build SQL query from filters
   */
  private buildQuery(): string {
    let query = `SELECT * FROM ${this.config.type}s WHERE 1=1`;
    
    for (const filter of this.config.filters) {
      query += this.buildFilterClause(filter);
    }
    
    return query;
  }

  /**
   * Build filter clause for SQL
   */
  private buildFilterClause(filter: ReportFilter): string {
    switch (filter.operator) {
      case 'equals':
        return ` AND ${filter.field} = '${filter.value}'`;
      case 'contains':
        return ` AND ${filter.field} LIKE '%${filter.value}%'`;
      case 'greater_than':
        return ` AND ${filter.field} > ${filter.value}`;
      case 'less_than':
        return ` AND ${filter.field} < ${filter.value}`;
      case 'between':
        return ` AND ${filter.field} BETWEEN ${filter.value[0]} AND ${filter.value[1]}`;
      case 'in':
        return ` AND ${filter.field} IN (${filter.value.map((v: any) => `'${v}'`).join(',')})`;
      default:
        return '';
    }
  }

  /**
   * Execute query against the current source-of-record tables
   */
  private async executeQuery(query: string): Promise<any[]> {
    console.log('Executing query:', query);

    const db = await requireDb();


    switch (this.config.type) {
      case 'transaction': {
        const result = await db.execute(sql`
          SELECT
            transaction_id as id,
            transaction_type as type,
            amount,
            status,
            initiated_at as date,
            currency
          FROM transactions
          ORDER BY initiated_at DESC
          LIMIT 500
        `);
        return result as any[];
      }
      case 'parcel': {
        const result = await db.execute(sql`
          SELECT
            id,
            parcel_id,
            land_use,
            area_sqm,
            status,
            created_at as date
          FROM parcels
          ORDER BY created_at DESC
          LIMIT 500
        `);
        return result as any[];
      }
      case 'revenue': {
        const result = await db.execute(sql`
          SELECT
            TO_CHAR(DATE_TRUNC('month', initiated_at), 'YYYY-MM') as month,
            COALESCE(SUM(amount), 0) as revenue,
            COUNT(*)::int as transactions
          FROM transactions
          GROUP BY DATE_TRUNC('month', initiated_at)
          ORDER BY DATE_TRUNC('month', initiated_at) DESC
          LIMIT 24
        `);
        return result as any[];
      }
      case 'custom':
      default: {
        const result = await db.execute(sql`
          SELECT
            transaction_id as id,
            transaction_type as type,
            amount,
            status,
            initiated_at as date,
            currency
          FROM transactions
          ORDER BY initiated_at DESC
          LIMIT 500
        `);
        return result as any[];
      }
    }
  }

  /**
   * Apply grouping to data
   */
  private applyGrouping(data: any[], groupBy: string[]): any[] {
    const grouped = new Map();
    
    for (const item of data) {
      const key = groupBy.map(field => item[field]).join('|');
      
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      
      grouped.get(key).push(item);
    }
    
    return Array.from(grouped.values()).map(group => {
      const first = group[0];
      const result: any = {};
      
      // Include group by fields
      for (const field of groupBy) {
        result[field] = first[field];
      }
      
      // Calculate aggregations for numeric fields
      for (const col of this.config.columns) {
        if (col.aggregation) {
          result[col.field] = this.aggregate(group, col.field, col.aggregation);
        }
      }
      
      return result;
    });
  }

  /**
   * Apply sorting to data
   */
  private applySorting(data: any[], sortBy: { field: string; order: 'asc' | 'desc' }[]): any[] {
    return data.sort((a, b) => {
      for (const sort of sortBy) {
        const aVal = a[sort.field];
        const bVal = b[sort.field];
        
        if (aVal === bVal) continue;
        
        const comparison = aVal > bVal ? 1 : -1;
        return sort.order === 'asc' ? comparison : -comparison;
      }
      
      return 0;
    });
  }

  /**
   * Calculate aggregations
   */
  private calculateAggregations(data: any[]): Record<string, number> {
    const aggregations: Record<string, number> = {};
    
    for (const col of this.config.columns) {
      if (col.aggregation) {
        aggregations[col.field] = this.aggregate(data, col.field, col.aggregation);
      }
    }
    
    return aggregations;
  }

  /**
   * Aggregate values
   */
  private aggregate(data: any[], field: string, aggregation: string): number {
    const values = data.map(item => item[field]).filter(v => v != null);
    
    switch (aggregation) {
      case 'sum':
        return values.reduce((sum, val) => sum + val, 0);
      case 'avg':
        return values.reduce((sum, val) => sum + val, 0) / values.length;
      case 'count':
        return values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      default:
        return 0;
    }
  }

  /**
   * Format data based on column definitions
   */
  private formatData(data: any[]): any[] {
    return data.map(item => {
      const formatted: any = {};
      
      for (const col of this.config.columns) {
        const value = item[col.field];
        
        formatted[col.field] = this.formatValue(value, col.type, col.format);
      }
      
      return formatted;
    });
  }

  /**
   * Format individual value
   */
  private formatValue(value: any, type: string, format?: string): any {
    if (value == null) return null;
    
    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
        }).format(value);
      
      case 'date':
        return format ? formatDate(new Date(value), format) : value;
      
      case 'number':
        return format ? Number(value).toFixed(parseInt(format)) : value;
      
      default:
        return value;
    }
  }

  /**
   * Export report to specified format
   */
  private async exportReport(result: ReportResult): Promise<string> {
    const filename = `report-${this.config.id}-${Date.now()}`;
    
    switch (this.config.format) {
      case 'csv':
        return await this.exportToCSV(result, filename);
      case 'excel':
        return await this.exportToExcel(result, filename);
      case 'pdf':
        return await this.exportToPDF(result, filename);
      case 'json':
        return await this.exportToJSON(result, filename);
      default:
        throw new Error(`Unsupported format: ${this.config.format}`);
    }
  }

  /**
   * Export to CSV
   */
  private async exportToCSV(result: ReportResult, filename: string): Promise<string> {
    const headers = this.config.columns.map(col => col.label).join(',');
    const rows = result.data.map(row =>
      this.config.columns.map(col => row[col.field]).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    
    const { url } = await storagePut(
      `reports/${filename}.csv`,
      Buffer.from(csv),
      'text/csv'
    );
    
    return url;
  }

  /**
   * Export to Excel
   */
  private async exportToExcel(result: ReportResult, filename: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(this.config.name.slice(0, 31) || 'Report');
    const columns = this.config.columns.length > 0
      ? this.config.columns
      : Object.keys(result.data[0] ?? {}).map((field) => ({
          field,
          label: field,
          type: 'string' as const,
        }));

    worksheet.columns = columns.map((column) => ({
      header: column.label,
      key: column.field,
      width: Math.max(column.label.length + 4, 18),
    }));

    worksheet.addRows(result.data.map((row) => {
      const normalizedRow: Record<string, string | number | boolean | null> = {};
      for (const column of columns) {
        const value = row[column.field];
        normalizedRow[column.field] = value instanceof Date ? value.toISOString() : (value ?? null);
      }
      return normalizedRow;
    }));

    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, worksheet.rowCount), column: Math.max(1, columns.length) },
    };

    const summary = workbook.addWorksheet('Summary');
    summary.addRow(['Report', this.config.name]);
    summary.addRow(['Generated At', result.generatedAt.toISOString()]);
    summary.addRow(['Total Records', result.summary.totalRecords]);
    Object.entries(result.summary.aggregations ?? {}).forEach(([key, value]) => {
      summary.addRow([key, value]);
    });
    summary.getColumn(1).width = 24;
    summary.getColumn(2).width = 32;

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const { url } = await storagePut(
      `reports/${filename}.xlsx`,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    return url;
  }

  /**
   * Export to PDF
   */
  private async exportToPDF(result: ReportResult, filename: string): Promise<string> {
    const columns = this.config.columns.length > 0
      ? this.config.columns
      : Object.keys(result.data[0] ?? {}).map((field) => ({
          field,
          label: field,
          type: 'string' as const,
        }));

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text(this.config.name || 'Report');
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#4b5563').text(`Generated at: ${result.generatedAt.toISOString()}`);
      doc.text(`Total records: ${result.summary.totalRecords}`);
      doc.moveDown();

      if (Object.keys(result.summary.aggregations ?? {}).length > 0) {
        doc.fontSize(12).fillColor('#111827').text('Summary');
        Object.entries(result.summary.aggregations ?? {}).forEach(([key, value]) => {
          doc.fontSize(10).text(`${key}: ${value}`);
        });
        doc.moveDown();
      }

      doc.fontSize(12).text('Records');
      doc.moveDown(0.5);
      const headers = columns.map((column) => column.label).join(' | ');
      doc.fontSize(9).text(headers, { underline: true });
      doc.moveDown(0.5);

      result.data.forEach((row, index) => {
        const line = columns.map((column) => {
          const value = row[column.field];
          if (value === null || value === undefined) return '—';
          if (typeof value === 'object') return JSON.stringify(value);
          return String(value);
        }).join(' | ');

        doc.fontSize(9).text(`${index + 1}. ${line}`);
        if (doc.y > 720) {
          doc.addPage();
        }
      });

      doc.end();
    });

    const { url } = await storagePut(
      `reports/${filename}.pdf`,
      buffer,
      'application/pdf'
    );

    return url;
  }

  /**
   * Export to JSON
   */
  private async exportToJSON(result: ReportResult, filename: string): Promise<string> {
    const json = JSON.stringify(result, null, 2);
    
    const { url } = await storagePut(
      `reports/${filename}.json`,
      Buffer.from(json),
      'application/json'
    );
    
    return url;
  }
}

/**
 * Report Scheduler
 * Handles scheduled report generation
 */
export class ReportScheduler {
  private schedules: Map<string, ReportConfig> = new Map();

  /**
   * Add scheduled report
   */
  addSchedule(config: ReportConfig) {
    if (!config.schedule) {
      throw new Error('Report configuration must include schedule');
    }
    
    this.schedules.set(config.id, config);
    console.log(`Scheduled report: ${config.name} (${config.schedule.frequency})`);
  }

  /**
   * Remove scheduled report
   */
  removeSchedule(reportId: string) {
    this.schedules.delete(reportId);
  }

  /**
   * Check and execute due reports
   */
  async checkAndExecute() {
    const now = new Date();
    
    for (const [id, config] of Array.from(this.schedules.entries())) {
      if (this.isDue(config, now)) {
        await this.executeScheduledReport(config);
      }
    }
  }

  /**
   * Check if report is due
   */
  private isDue(config: ReportConfig, now: Date): boolean {
    if (!config.schedule) return false;
    
    const schedule = config.schedule;
    const currentTime = formatDate(now, 'HH:mm');
    
    if (currentTime !== schedule.time) {
      return false;
    }
    
    switch (schedule.frequency) {
      case 'daily':
        return true;
      
      case 'weekly':
        return now.getDay() === schedule.dayOfWeek;
      
      case 'monthly':
        return now.getDate() === schedule.dayOfMonth;
      
      case 'quarterly':
        const month = now.getMonth();
        return [0, 3, 6, 9].includes(month) && now.getDate() === 1;
      
      default:
        return false;
    }
  }

  /**
   * Execute scheduled report
   */
  private async executeScheduledReport(config: ReportConfig) {
    console.log(`Executing scheduled report: ${config.name}`);
    
    try {
      const builder = new ReportBuilder(config);
      const result = await builder.generate();
      
      // Send to recipients if specified
      if (config.recipients && config.recipients.length > 0) {
        await this.sendReportToRecipients(config, result);
      }
      
      console.log(`Report executed successfully: ${config.name}`);
    } catch (error) {
      console.error(`Error executing report ${config.name}:`, error);
    }
  }

  /**
   * Send report to recipients via email
   */
  private async sendReportToRecipients(config: ReportConfig, result: ReportResult) {
    for (const recipient of config.recipients!) {
      console.log(`Sending report to: ${recipient}`);

      await sendEmail({
        to: recipient,
        subject: `Scheduled Report: ${config.name}`,
        html: `
          <p>Your scheduled report <strong>${config.name}</strong> has been generated.</p>
          <p>Generated at: ${result.generatedAt.toISOString()}</p>
          <p>Total records: ${result.summary.totalRecords}</p>
          ${result.exportUrl ? `<p>Download: <a href="${result.exportUrl}">${result.exportUrl}</a></p>` : '<p>The report was generated successfully but no export URL is currently available.</p>'}
        `,
        text: `Your scheduled report ${config.name} has been generated. Total records: ${result.summary.totalRecords}. ${result.exportUrl ? `Download: ${result.exportUrl}` : 'No export URL is currently available.'}`,
      });
    }
  }
}

/**
 * Report Templates
 */
export const reportTemplates: Record<string, Partial<ReportConfig>> = {
  transactionSummary: {
    name: 'Transaction Summary Report',
    description: 'Summary of all transactions with totals and averages',
    type: 'transaction',
    columns: [
      { field: 'type', label: 'Transaction Type', type: 'string' },
      { field: 'count', label: 'Count', type: 'number', aggregation: 'count' },
      { field: 'amount', label: 'Total Amount', type: 'currency', aggregation: 'sum' },
      { field: 'avgAmount', label: 'Average Amount', type: 'currency', aggregation: 'avg' },
    ],
    groupBy: ['type'],
    format: 'excel',
  },
  
  revenueReport: {
    name: 'Revenue Report',
    description: 'Monthly revenue breakdown',
    type: 'transaction',
    columns: [
      { field: 'month', label: 'Month', type: 'string' },
      { field: 'revenue', label: 'Revenue', type: 'currency', aggregation: 'sum' },
      { field: 'transactions', label: 'Transactions', type: 'number', aggregation: 'count' },
    ],
    groupBy: ['month'],
    sortBy: [{ field: 'month', order: 'desc' }],
    format: 'pdf',
  },
  
  parcelInventory: {
    name: 'Parcel Inventory Report',
    description: 'Complete inventory of all parcels',
    type: 'parcel',
    columns: [
      { field: 'id', label: 'Parcel ID', type: 'string' },
      { field: 'owner', label: 'Owner', type: 'string' },
      { field: 'location', label: 'Location', type: 'string' },
      { field: 'area', label: 'Area (sqm)', type: 'number' },
      { field: 'value', label: 'Estimated Value', type: 'currency' },
      { field: 'status', label: 'Status', type: 'string' },
    ],
    format: 'csv',
  },
};
