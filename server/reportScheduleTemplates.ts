/**
 * Report Schedule Templates
 * Pre-configured schedule templates for common reporting scenarios
 * Users can activate these templates with one click instead of manual configuration
 */

export interface ReportScheduleTemplate {
  id: string;
  name: string;
  description: string;
  reportType: 'mortgage_analytics' | 'commission_statement' | 'broker_performance' | 'investor_roi' | 'compliance_report';
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  cronExpression?: string;
  format: 'pdf' | 'csv' | 'excel';
  emailDelivery: boolean;
  defaultRecipients: string[];
  filters: Record<string, any>;
  icon: string;
  category: 'broker' | 'investor' | 'compliance' | 'analytics';
}

export const REPORT_SCHEDULE_TEMPLATES: ReportScheduleTemplate[] = [
  // Broker Templates
  {
    id: 'monthly-broker-commission',
    name: 'Monthly Broker Commission Report',
    description: 'Automated monthly commission statement for brokers with detailed breakdown',
    reportType: 'commission_statement',
    frequency: 'monthly',
    cronExpression: '0 0 9 1 * *', // 9 AM on the 1st of every month
    format: 'pdf',
    emailDelivery: true,
    defaultRecipients: [],
    filters: {
      includeBreakdown: true,
      includeTaxInfo: true,
    },
    icon: 'DollarSign',
    category: 'broker',
  },
  {
    id: 'weekly-broker-performance',
    name: 'Weekly Broker Performance Summary',
    description: 'Weekly performance metrics for all brokers including applications and commissions',
    reportType: 'broker_performance',
    frequency: 'weekly',
    cronExpression: '0 0 9 * * 1', // 9 AM every Monday
    format: 'pdf',
    emailDelivery: true,
    defaultRecipients: [],
    filters: {
      includeCharts: true,
      topBrokersCount: 10,
    },
    icon: 'TrendingUp',
    category: 'broker',
  },
  {
    id: 'daily-broker-activity',
    name: 'Daily Broker Activity Report',
    description: 'Daily summary of broker activities, new applications, and commission updates',
    reportType: 'broker_performance',
    frequency: 'daily',
    cronExpression: '0 0 18 * * *', // 6 PM every day
    format: 'csv',
    emailDelivery: true,
    defaultRecipients: [],
    filters: {
      includeNewApplications: true,
      includeCommissionUpdates: true,
    },
    icon: 'FileText',
    category: 'broker',
  },

  // Investor Templates
  {
    id: 'monthly-investor-roi',
    name: 'Monthly Investor ROI Report',
    description: 'Comprehensive monthly ROI analysis for all active investors and pools',
    reportType: 'investor_roi',
    frequency: 'monthly',
    cronExpression: '0 0 9 1 * *', // 9 AM on the 1st of every month
    format: 'pdf',
    emailDelivery: true,
    defaultRecipients: [],
    filters: {
      includePoolBreakdown: true,
      includeProjections: true,
    },
    icon: 'Briefcase',
    category: 'investor',
  },
  {
    id: 'weekly-investor-performance',
    name: 'Weekly Investor Performance Update',
    description: 'Weekly update on investor portfolio performance and new opportunities',
    reportType: 'investor_roi',
    frequency: 'weekly',
    cronExpression: '0 0 9 * * 5', // 9 AM every Friday
    format: 'pdf',
    emailDelivery: true,
    defaultRecipients: [],
    filters: {
      includeNewPools: true,
      includeDistributions: true,
    },
    icon: 'BarChart3',
    category: 'investor',
  },

  // Analytics Templates
  {
    id: 'weekly-pipeline-analytics',
    name: 'Weekly Pipeline Analytics',
    description: 'Comprehensive weekly analysis of mortgage application pipeline and trends',
    reportType: 'mortgage_analytics',
    frequency: 'weekly',
    cronExpression: '0 0 9 * * 1', // 9 AM every Monday
    format: 'pdf',
    emailDelivery: true,
    defaultRecipients: [],
    filters: {
      includePipelineMetrics: true,
      includeTrendAnalysis: true,
    },
    icon: 'TrendingUp',
    category: 'analytics',
  },
  {
    id: 'monthly-comprehensive-analytics',
    name: 'Monthly Comprehensive Analytics',
    description: 'Full monthly analytics report with all metrics, charts, and insights',
    reportType: 'mortgage_analytics',
    frequency: 'monthly',
    cronExpression: '0 0 9 1 * *', // 9 AM on the 1st of every month
    format: 'pdf',
    emailDelivery: true,
    defaultRecipients: [],
    filters: {
      includeAllMetrics: true,
      includeBrokerPerformance: true,
      includeInvestorROI: true,
      includeComplianceScore: true,
    },
    icon: 'BarChart3',
    category: 'analytics',
  },
  {
    id: 'daily-quick-stats',
    name: 'Daily Quick Stats',
    description: 'Quick daily snapshot of key metrics and activities',
    reportType: 'mortgage_analytics',
    frequency: 'daily',
    cronExpression: '0 0 8 * * *', // 8 AM every day
    format: 'csv',
    emailDelivery: true,
    defaultRecipients: [],
    filters: {
      quickStats: true,
      yesterday: true,
    },
    icon: 'FileText',
    category: 'analytics',
  },

  // Compliance Templates
  {
    id: 'monthly-compliance-report',
    name: 'Monthly Compliance Report',
    description: 'Comprehensive monthly compliance audit with all regulatory metrics',
    reportType: 'compliance_report',
    frequency: 'monthly',
    cronExpression: '0 0 9 1 * *', // 9 AM on the 1st of every month
    format: 'pdf',
    emailDelivery: true,
    defaultRecipients: [],
    filters: {
      includeAuditTrail: true,
      includeViolations: true,
      includeRemediation: true,
    },
    icon: 'Shield',
    category: 'compliance',
  },
  {
    id: 'weekly-compliance-check',
    name: 'Weekly Compliance Check',
    description: 'Weekly compliance status check and risk assessment',
    reportType: 'compliance_report',
    frequency: 'weekly',
    cronExpression: '0 0 9 * * 5', // 9 AM every Friday
    format: 'pdf',
    emailDelivery: true,
    defaultRecipients: [],
    filters: {
      includeRiskScore: true,
      includeRecentChanges: true,
    },
    icon: 'Shield',
    category: 'compliance',
  },
];

/**
 * Get all report schedule templates
 */
export function getAllTemplates(): ReportScheduleTemplate[] {
  return REPORT_SCHEDULE_TEMPLATES;
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: 'broker' | 'investor' | 'compliance' | 'analytics'): ReportScheduleTemplate[] {
  return REPORT_SCHEDULE_TEMPLATES.filter(t => t.category === category);
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): ReportScheduleTemplate | undefined {
  return REPORT_SCHEDULE_TEMPLATES.find(t => t.id === id);
}

/**
 * Create schedule from template
 */
export function createScheduleFromTemplate(
  template: ReportScheduleTemplate,
  userId: number,
  customName?: string,
  customRecipients?: string[]
): {
  name: string;
  description: string;
  reportType: 'mortgage_analytics' | 'commission_statement' | 'broker_performance' | 'investor_roi' | 'compliance_report';
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
  cronExpression?: string;
  format: 'pdf' | 'csv' | 'excel';
  emailDelivery: boolean;
  emailRecipients: string;
  filters: string;
  isActive: boolean;
  userId: number;
} {
  return {
    name: customName || template.name,
    description: template.description,
    reportType: template.reportType as 'mortgage_analytics' | 'commission_statement' | 'broker_performance' | 'investor_roi' | 'compliance_report',
    frequency: template.frequency as 'once' | 'daily' | 'weekly' | 'monthly' | 'custom',
    cronExpression: template.cronExpression,
    format: template.format as 'pdf' | 'csv' | 'excel',
    emailDelivery: template.emailDelivery,
    emailRecipients: JSON.stringify(customRecipients || template.defaultRecipients),
    filters: JSON.stringify(template.filters),
    isActive: true,
    userId,
  };
}
