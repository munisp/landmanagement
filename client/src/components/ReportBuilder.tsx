import { useState } from 'react';
import { FileText, Download, Eye, Settings, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: 'parcel' | 'transaction' | 'financial' | 'compliance' | 'custom';
  fields: ReportField[];
  filters: ReportFilter[];
}

export interface ReportField {
  id: string;
  label: string;
  key: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'currency';
  required: boolean;
  defaultIncluded: boolean;
}

export interface ReportFilter {
  id: string;
  label: string;
  key: string;
  type: 'text' | 'select' | 'date-range' | 'number-range';
  options?: string[];
}

interface ReportBuilderProps {
  templates: ReportTemplate[];
  onGenerate: (config: ReportConfig) => Promise<void>;
  onPreview: (config: ReportConfig) => void;
}

export interface ReportConfig {
  templateId: string;
  title: string;
  description?: string;
  includedFields: string[];
  filters: Record<string, any>;
  format: 'pdf' | 'excel' | 'csv';
  groupBy?: string;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

const defaultTemplates: ReportTemplate[] = [
  {
    id: 'parcel-registry',
    name: 'Parcel Registry Report',
    description: 'Comprehensive list of all parcels with ownership details',
    category: 'parcel',
    fields: [
      { id: '1', label: 'Parcel ID', key: 'parcelId', type: 'text', required: true, defaultIncluded: true },
      { id: '2', label: 'Location', key: 'location', type: 'text', required: true, defaultIncluded: true },
      { id: '3', label: 'Area (sqm)', key: 'area', type: 'number', required: false, defaultIncluded: true },
      { id: '4', label: 'Owner Name', key: 'ownerName', type: 'text', required: false, defaultIncluded: true },
      { id: '5', label: 'Land Use', key: 'landUse', type: 'text', required: false, defaultIncluded: true },
      { id: '6', label: 'Registration Date', key: 'registrationDate', type: 'date', required: false, defaultIncluded: true },
      { id: '7', label: 'Market Value', key: 'marketValue', type: 'currency', required: false, defaultIncluded: false },
    ],
    filters: [
      { id: '1', label: 'Location', key: 'location', type: 'text' },
      { id: '2', label: 'Land Use', key: 'landUse', type: 'select', options: ['Residential', 'Commercial', 'Agricultural', 'Industrial'] },
      { id: '3', label: 'Registration Date', key: 'registrationDate', type: 'date-range' },
      { id: '4', label: 'Area Range (sqm)', key: 'areaRange', type: 'number-range' },
    ],
  },
  {
    id: 'transaction-summary',
    name: 'Transaction Summary Report',
    description: 'Summary of all land transactions within a period',
    category: 'transaction',
    fields: [
      { id: '1', label: 'Transaction ID', key: 'transactionId', type: 'text', required: true, defaultIncluded: true },
      { id: '2', label: 'Parcel ID', key: 'parcelId', type: 'text', required: true, defaultIncluded: true },
      { id: '3', label: 'Transaction Type', key: 'type', type: 'text', required: true, defaultIncluded: true },
      { id: '4', label: 'From Owner', key: 'fromOwner', type: 'text', required: false, defaultIncluded: true },
      { id: '5', label: 'To Owner', key: 'toOwner', type: 'text', required: false, defaultIncluded: true },
      { id: '6', label: 'Amount', key: 'amount', type: 'currency', required: false, defaultIncluded: true },
      { id: '7', label: 'Status', key: 'status', type: 'text', required: false, defaultIncluded: true },
      { id: '8', label: 'Date', key: 'date', type: 'date', required: false, defaultIncluded: true },
    ],
    filters: [
      { id: '1', label: 'Transaction Type', key: 'type', type: 'select', options: ['Sale', 'Transfer', 'Lease', 'Mortgage'] },
      { id: '2', label: 'Status', key: 'status', type: 'select', options: ['Pending', 'Approved', 'Rejected', 'Completed'] },
      { id: '3', label: 'Date Range', key: 'dateRange', type: 'date-range' },
      { id: '4', label: 'Amount Range', key: 'amountRange', type: 'number-range' },
    ],
  },
  {
    id: 'financial-overview',
    name: 'Financial Overview Report',
    description: 'Financial summary including fees, taxes, and revenue',
    category: 'financial',
    fields: [
      { id: '1', label: 'Period', key: 'period', type: 'text', required: true, defaultIncluded: true },
      { id: '2', label: 'Total Transactions', key: 'totalTransactions', type: 'number', required: true, defaultIncluded: true },
      { id: '3', label: 'Total Revenue', key: 'totalRevenue', type: 'currency', required: true, defaultIncluded: true },
      { id: '4', label: 'Registration Fees', key: 'registrationFees', type: 'currency', required: false, defaultIncluded: true },
      { id: '5', label: 'Transfer Fees', key: 'transferFees', type: 'currency', required: false, defaultIncluded: true },
      { id: '6', label: 'Taxes Collected', key: 'taxesCollected', type: 'currency', required: false, defaultIncluded: true },
    ],
    filters: [
      { id: '1', label: 'Period', key: 'period', type: 'select', options: ['Last Month', 'Last Quarter', 'Last Year', 'Custom'] },
      { id: '2', label: 'Date Range', key: 'dateRange', type: 'date-range' },
    ],
  },
];

export function ReportBuilder({
  templates = defaultTemplates,
  onGenerate,
  onPreview,
}: ReportBuilderProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [reportConfig, setReportConfig] = useState<Partial<ReportConfig>>({
    format: 'pdf',
    sortOrder: 'asc',
    includedFields: [],
    filters: {},
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleTemplateSelect = (template: ReportTemplate) => {
    setSelectedTemplate(template);
    setReportConfig({
      templateId: template.id,
      title: template.name,
      includedFields: template.fields.filter(f => f.defaultIncluded).map(f => f.id),
      filters: {},
      format: 'pdf',
      sortOrder: 'asc',
    });
  };

  const handleFieldToggle = (fieldId: string, checked: boolean) => {
    setReportConfig(prev => ({
      ...prev,
      includedFields: checked
        ? [...(prev.includedFields || []), fieldId]
        : (prev.includedFields || []).filter(id => id !== fieldId),
    }));
  };

  const handleFilterChange = (filterKey: string, value: any) => {
    setReportConfig(prev => ({
      ...prev,
      filters: {
        ...(prev.filters || {}),
        [filterKey]: value,
      },
    }));
  };

  const handleGenerate = async () => {
    if (!selectedTemplate || !reportConfig.templateId) {
      toast.error('Please select a template');
      return;
    }

    if ((reportConfig.includedFields || []).length === 0) {
      toast.error('Please select at least one field');
      return;
    }

    setIsGenerating(true);
    try {
      await onGenerate(reportConfig as ReportConfig);
      toast.success('Report generated successfully');
    } catch (error) {
      toast.error('Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = () => {
    if (!selectedTemplate || !reportConfig.templateId) {
      toast.error('Please select a template');
      return;
    }

    onPreview(reportConfig as ReportConfig);
    setShowPreview(true);
  };

  const categories = Array.from(new Set(templates.map(t => t.category)));

  return (
    <div className="space-y-6">
      {/* Template Selection */}
      {!selectedTemplate ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Choose a Report Template</h2>
            <p className="text-muted-foreground">
              Select a pre-built template or create a custom report
            </p>
          </div>

          {categories.map(category => (
            <div key={category} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">
                {category}
              </h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates
                  .filter(t => t.category === category)
                  .map(template => (
                    <Card
                      key={template.id}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => handleTemplateSelect(template)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <FileText className="h-5 w-5 text-primary" />
                          <Badge variant="secondary">{template.category}</Badge>
                        </div>
                        <CardTitle className="text-base">{template.name}</CardTitle>
                        <CardDescription className="text-sm">
                          {template.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-muted-foreground">
                          {template.fields.length} fields • {template.filters.length} filters
                        </p>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{selectedTemplate.name}</h2>
              <p className="text-muted-foreground">{selectedTemplate.description}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedTemplate(null)}
            >
              <X className="h-4 w-4 mr-2" />
              Change Template
            </Button>
          </div>

          {/* Configuration Tabs */}
          <Tabs defaultValue="fields" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="fields">Fields</TabsTrigger>
              <TabsTrigger value="filters">Filters</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            {/* Fields Tab */}
            <TabsContent value="fields" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Select Fields to Include</CardTitle>
                  <CardDescription>
                    Choose which fields to include in your report
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedTemplate.fields.map(field => (
                    <div key={field.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={field.id}
                        checked={(reportConfig.includedFields || []).includes(field.id)}
                        onCheckedChange={(checked) =>
                          handleFieldToggle(field.id, checked as boolean)
                        }
                        disabled={field.required}
                      />
                      <Label
                        htmlFor={field.id}
                        className="flex-1 cursor-pointer flex items-center justify-between"
                      >
                        <span>
                          {field.label}
                          {field.required && (
                            <Badge variant="secondary" className="ml-2">Required</Badge>
                          )}
                        </span>
                        <Badge variant="outline">{field.type}</Badge>
                      </Label>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Filters Tab */}
            <TabsContent value="filters" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Apply Filters</CardTitle>
                  <CardDescription>
                    Filter the data included in your report
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedTemplate.filters.map(filter => (
                    <div key={filter.id} className="space-y-2">
                      <Label>{filter.label}</Label>
                      {filter.type === 'text' && (
                        <Input
                          placeholder={`Enter ${filter.label.toLowerCase()}`}
                          value={reportConfig.filters?.[filter.key] || ''}
                          onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                        />
                      )}
                      {filter.type === 'select' && (
                        <Select
                          value={reportConfig.filters?.[filter.key] || ''}
                          onValueChange={(value) => handleFilterChange(filter.key, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`Select ${filter.label.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {filter.options?.map(option => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {filter.type === 'date-range' && (
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="date"
                            placeholder="Start date"
                            value={reportConfig.filters?.[filter.key]?.start || ''}
                            onChange={(e) =>
                              handleFilterChange(filter.key, {
                                ...reportConfig.filters?.[filter.key],
                                start: e.target.value,
                              })
                            }
                          />
                          <Input
                            type="date"
                            placeholder="End date"
                            value={reportConfig.filters?.[filter.key]?.end || ''}
                            onChange={(e) =>
                              handleFilterChange(filter.key, {
                                ...reportConfig.filters?.[filter.key],
                                end: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                      {filter.type === 'number-range' && (
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            placeholder="Min"
                            value={reportConfig.filters?.[filter.key]?.min || ''}
                            onChange={(e) =>
                              handleFilterChange(filter.key, {
                                ...reportConfig.filters?.[filter.key],
                                min: e.target.value,
                              })
                            }
                          />
                          <Input
                            type="number"
                            placeholder="Max"
                            value={reportConfig.filters?.[filter.key]?.max || ''}
                            onChange={(e) =>
                              handleFilterChange(filter.key, {
                                ...reportConfig.filters?.[filter.key],
                                max: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Report Settings</CardTitle>
                  <CardDescription>
                    Configure report format and sorting options
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Report Title</Label>
                    <Input
                      id="title"
                      value={reportConfig.title || ''}
                      onChange={(e) =>
                        setReportConfig(prev => ({ ...prev, title: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description (Optional)</Label>
                    <Textarea
                      id="description"
                      value={reportConfig.description || ''}
                      onChange={(e) =>
                        setReportConfig(prev => ({ ...prev, description: e.target.value }))
                      }
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="format">Export Format</Label>
                    <Select
                      value={reportConfig.format || 'pdf'}
                      onValueChange={(value: any) =>
                        setReportConfig(prev => ({ ...prev, format: value }))
                      }
                    >
                      <SelectTrigger id="format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pdf">PDF</SelectItem>
                        <SelectItem value="excel">Excel</SelectItem>
                        <SelectItem value="csv">CSV</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sortBy">Sort By</Label>
                      <Select
                        value={reportConfig.sortBy || ''}
                        onValueChange={(value) =>
                          setReportConfig(prev => ({ ...prev, sortBy: value }))
                        }
                      >
                        <SelectTrigger id="sortBy">
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedTemplate.fields.map(field => (
                            <SelectItem key={field.id} value={field.key}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sortOrder">Sort Order</Label>
                      <Select
                        value={reportConfig.sortOrder || 'asc'}
                        onValueChange={(value: any) =>
                          setReportConfig(prev => ({ ...prev, sortOrder: value }))
                        }
                      >
                        <SelectTrigger id="sortOrder">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">Ascending</SelectItem>
                          <SelectItem value="desc">Descending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={isGenerating}
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || (reportConfig.includedFields || []).length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              {isGenerating ? 'Generating...' : 'Generate Report'}
            </Button>
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report Preview</DialogTitle>
            <DialogDescription>
              Preview of your report configuration
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Report Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Template:</span>{' '}
                  {selectedTemplate?.name}
                </div>
                <div>
                  <span className="text-muted-foreground">Format:</span>{' '}
                  {reportConfig.format?.toUpperCase()}
                </div>
                <div>
                  <span className="text-muted-foreground">Fields:</span>{' '}
                  {reportConfig.includedFields?.length}
                </div>
                <div>
                  <span className="text-muted-foreground">Filters:</span>{' '}
                  {Object.keys(reportConfig.filters || {}).length}
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Included Fields</h3>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate?.fields
                  .filter(f => reportConfig.includedFields?.includes(f.id))
                  .map(field => (
                    <Badge key={field.id} variant="secondary">
                      {field.label}
                    </Badge>
                  ))}
              </div>
            </div>
            {Object.keys(reportConfig.filters || {}).length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Active Filters</h3>
                <div className="space-y-2">
                  {Object.entries(reportConfig.filters || {}).map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <span className="font-medium">{key}:</span>{' '}
                      <span className="text-muted-foreground">
                        {typeof value === 'object' ? JSON.stringify(value) : value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
