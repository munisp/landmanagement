import { useEffect, lazy, Suspense } from 'react';
import { Route, Switch, useLocation } from "wouter";
import { Loader2 } from 'lucide-react';

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { SkipToContent } from "@/components/SkipToContent";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { AddToHomeScreenPrompt } from "@/components/AddToHomeScreenPrompt";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { initializeKeyboardShortcuts, cleanupKeyboardShortcuts } from './lib/keyboardShortcuts';
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from './pages/Home';
import Dashboard from "./pages/Dashboard";
import SearchParcels from "./pages/SearchParcels";

// Lazy load heavy feature pages
const Reports = lazy(() => import("@/pages/Reports"));
const BulkImport = lazy(() => import("@/pages/BulkImport"));
const UserProfile = lazy(() => import("@/pages/UserProfile"));
const PaymentProcessing = lazy(() => import("@/pages/PaymentProcessing"));
const ApiDocs = lazy(() => import("@/pages/ApiDocs"));
const AuditTrail = lazy(() => import("@/pages/AuditTrail"));
const BlockchainExplorer = lazy(() => import("@/pages/BlockchainExplorer"));
const PropertyValuation = lazy(() => import("@/pages/PropertyValuation"));
const DisputeResolution = lazy(() => import("./pages/DisputeResolution"));
const GeoAnalytics = lazy(() => import("./pages/GeoAnalytics"));
const PerformanceMonitor = lazy(() => import("./pages/PerformanceMonitor"));
const SecurityDashboard = lazy(() => import("./pages/SecurityDashboard"));
const IdentityVerification = lazy(() => import("./pages/IdentityVerification"));
const WorkflowDesigner = lazy(() => import("./pages/WorkflowDesigner"));
const BackupRecovery = lazy(() => import("./pages/BackupRecovery"));
const ComplianceDashboard = lazy(() => import("./pages/ComplianceDashboard"));
const SurveyEquipment = lazy(() => import("./pages/SurveyEquipment"));
const DataExportImport = lazy(() => import("./pages/DataExportImport"));
const RBACManagement = lazy(() => import("./pages/RBACManagement"));
const AdvancedAnalytics = lazy(() => import("./pages/AdvancedAnalytics"));
const Collaboration = lazy(() => import("@/pages/Collaboration"));
const GovernmentIntegration = lazy(() => import("@/pages/GovernmentIntegration"));
const Building3DVisualization = lazy(() => import("@/pages/Building3DVisualization"));
const MortgageApplication = lazy(() => import("@/pages/MortgageApplication"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const MarketplaceListing = lazy(() => import("./pages/MarketplaceListing"));
const PropertyDetails = lazy(() => import('./pages/PropertyDetails'));
const MortgageApplicationPage = lazy(() => import('./pages/MortgageApplicationPage'));
const MortgageDashboard = lazy(() => import('./pages/MortgageDashboard'));
const LoanOfficerDashboard = lazy(() => import('./pages/LoanOfficerDashboard'));
const BorrowerPaymentPortal = lazy(() => import('./pages/BorrowerPaymentPortal'));
const BrokerDashboard = lazy(() => import('./pages/BrokerDashboard'));
const InvestorDashboard = lazy(() => import('./pages/InvestorDashboard'));
const RegulatoryComplianceDashboard = lazy(() => import('./pages/RegulatoryComplianceDashboard'));
const PoolingSchedulerDashboard = lazy(() => import('./pages/PoolingSchedulerDashboard'));
const CommissionManagementDashboard = lazy(() => import('./pages/CommissionManagementDashboard'));
const MortgageAnalyticsDashboard = lazy(() => import('./pages/MortgageAnalyticsDashboard'));
const WebhookManagementDashboard = lazy(() => import('./pages/WebhookManagementDashboard'));
const ReportSchedulerDashboard = lazy(() => import('./pages/ReportSchedulerDashboard'));
const ReportHistoryDashboard = lazy(() => import('./pages/ReportHistoryDashboard'));
const IntegrationHealthDashboard = lazy(() => import('./pages/IntegrationHealthDashboard'));
const WebhookTestingDashboard = lazy(() => import('./pages/WebhookTestingDashboard'));
const SupportCenter = lazy(() => import('./pages/SupportCenter'));
const MarketingCenter = lazy(() => import('./pages/MarketingCenter'));
const IoTOperations = lazy(() => import('./pages/IoTOperations'));
const LegalDocumentCenter = lazy(() => import('./pages/LegalDocumentCenter'));
const CivicComplianceCenter = lazy(() => import('./pages/CivicComplianceCenter'));
const UtilityConnectionCenter = lazy(() => import('./pages/UtilityConnectionCenter'));
const CommunityEngagementCenter = lazy(() => import('./pages/CommunityEngagementCenter'));
const HeritageProtectionCenter = lazy(() => import('./pages/HeritageProtectionCenter'));
const AgriculturalLandCenter = lazy(() => import('./pages/AgriculturalLandCenter'));
const MiningRightsCenter = lazy(() => import('./pages/MiningRightsCenter'));
const CoastalZoneCenter = lazy(() => import('./pages/CoastalZoneCenter'));
const ForestReserveCenter = lazy(() => import('./pages/ForestReserveCenter'));
const InfrastructureDevelopmentCenter = lazy(() => import('./pages/InfrastructureDevelopmentCenter'));
const AdvancedGeospatialCenter = lazy(() => import('./pages/AdvancedGeospatialCenter'));
const GeoLibreWorkspace = lazy(() => import('./pages/GeoLibreWorkspace'));
const AccessibilityCenter = lazy(() => import('./pages/AccessibilityCenter'));
const TrainingSupportCenter = lazy(() => import('./pages/TrainingSupportCenter'));
const DataGovernanceCenter = lazy(() => import('./pages/DataGovernanceCenter'));
const AdvancedSearchDiscoveryCenter = lazy(() => import('./pages/AdvancedSearchDiscoveryCenter'));
const AIDocumentProcessing = lazy(() => import("./pages/AIDocumentProcessing"));
const TitleRiskCopilot = lazy(() => import("./pages/TitleRiskCopilot"));
const RegistryIntegrityDashboard = lazy(() => import("./pages/RegistryIntegrityDashboard"));
const CommandCenter = lazy(() => import("./pages/CommandCenter"));
const ParcelDigitalTwin = lazy(() => import("./pages/ParcelDigitalTwin"));
const DroneProcessing = lazy(() => import("./pages/DroneProcessing"));
const TaxAssessment = lazy(() => import("./pages/TaxAssessment"));
const GeospatialSearchPage = lazy(() => import("./pages/GeospatialSearchPage"));
const VerificationWorkflow = lazy(() => import('./pages/VerificationWorkflow'));
const ReportingDashboard = lazy(() => import('./pages/ReportingDashboard'));
const VerificationAnalytics = lazy(() => import('./pages/VerificationAnalytics'));
const SecurityMonitoring = lazy(() => import('./pages/SecurityMonitoring'));
const DocumentValidation = lazy(() => import('./pages/DocumentValidation'));
const FieldSurveyor = lazy(() => import('./pages/FieldSurveyor'));
const ExecutiveDashboard = lazy(() => import('./pages/ExecutiveDashboard'));
const BlockchainTransactions = lazy(() => import('./pages/BlockchainTransactions'));
const BlockchainVerify = lazy(() => import('./pages/BlockchainVerify'));
const ApiKeyManagement = lazy(() => import('./pages/ApiKeyManagement'));
const PaymentInitiation = lazy(() => import('./pages/PaymentInitiation'));
const MojaloopPaymentHistory = lazy(() => import('./pages/MojaloopPaymentHistory'));
const MojaloopPaymentStatus = lazy(() => import('./pages/MojaloopPaymentStatus'));
const UnifiedDashboard = lazy(() => import('./pages/UnifiedDashboard'));
const TitleDetails = lazy(() => import('./pages/TitleDetails'));
const TransactionLauncher = lazy(() => import('./pages/TransactionLauncher'));

// Lazy load non-critical pages
const AnalyticsDashboard = lazy(() => import('./pages/AnalyticsDashboard'));
const BulkOperations = lazy(() => import('./pages/BulkOperations'));
const PersonalizedDashboard = lazy(() => import('./pages/PersonalizedDashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const ParcelDetails = lazy(() => import("./pages/ParcelDetails"));
const ParcelMap = lazy(() => import("./pages/ParcelMap"));
const InitiateTransaction = lazy(() => import("./pages/InitiateTransaction"));
const TransactionDetails = lazy(() => import("./pages/TransactionDetails"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUserManagement = lazy(() => import("./pages/AdminUserManagement"));
const AdminPhase4Dashboard = lazy(() => import("./pages/AdminPhase4Dashboard"));

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function Router() {
  const [, navigate] = useLocation();

  useEffect(() => {
    // Initialize keyboard shortcuts
    initializeKeyboardShortcuts(navigate);

    // Cleanup on unmount
    return () => {
      cleanupKeyboardShortcuts();
    };
  }, [navigate]);

  return (
    <Suspense fallback={<PageLoader />}>
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/search"} component={SearchParcels} />
      <Route path="/geospatial-search" component={GeospatialSearchPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/unified-dashboard" component={UnifiedDashboard} />
          <Route path="/analytics" component={AnalyticsDashboard} />
          <Route path="/bulk-operations" component={BulkOperations} />
          <Route path="/personalized-dashboard" component={PersonalizedDashboard} />
        <Route path="/settings" component={Settings} />
      <Route path={"/parcels/:id"} component={ParcelDetails} />
      <Route path={"/parcels/:id/map"} component={ParcelMap} />
      <Route path={"/transactions/initiate/:parcelId"} component={InitiateTransaction} />
      <Route path="/transactions/new" component={TransactionLauncher} />
      <Route path="/transactions/:id" component={TransactionDetails} />
      <Route path="/titles/:id" component={TitleDetails} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/users" component={AdminUserManagement} />
      <Route path="/admin/phase4" component={AdminPhase4Dashboard} />
            <Route path="/verification" component={VerificationWorkflow} />
            <Route path="/reporting" component={ReportingDashboard} />
            <Route path="/verification-analytics" component={VerificationAnalytics} />
            <Route path="/security-monitoring" component={SecurityMonitoring} />
            <Route path="/document-validation" component={DocumentValidation} />
      <Route path="/document-verification" component={DocumentValidation} />
            <Route path="/field-surveyor" component={FieldSurveyor} />
            <Route path="/executive-dashboard" component={ExecutiveDashboard} />
            <Route path="/blockchain-transactions" component={BlockchainTransactions} />
      <Route path="/reports" component={Reports} />      <Route path={"/bulk-import"} component={BulkImport} />
      <Route path={"/profile"} component={UserProfile} />
      <Route path={"/payments/:transactionId"} component={PaymentProcessing} />
      <Route path={"/api-docs"} component={ApiDocs} />
      <Route path={"/audit-trail"} component={AuditTrail} />
      <Route path={'/blockchain'} component={BlockchainExplorer} />
      <Route path={'/verify'} component={BlockchainVerify} />
      <Route path={'/api-keys'} component={ApiKeyManagement} />
      <Route path={'/mojaloop/payments/new'} component={PaymentInitiation} />
      <Route path={'/mojaloop/payments/:transactionId'} component={MojaloopPaymentStatus} />
      <Route path={'/mojaloop/payments'} component={MojaloopPaymentHistory} />
      <Route path={"/valuation"} component={PropertyValuation} />
        <Route path="/disputes" component={DisputeResolution} />
      <Route path="/geo-analytics" component={GeoAnalytics} />
      <Route path="/performance" component={PerformanceMonitor} />
      <Route path="/security" component={SecurityDashboard} />
      <Route path="/identity-verification" component={IdentityVerification} />
      <Route path="/workflows" component={WorkflowDesigner} />
      <Route path="/backup-recovery" component={BackupRecovery} />
      <Route path="/compliance" component={ComplianceDashboard} />
      <Route path="/survey-equipment" component={SurveyEquipment} />
      <Route path="/data-export-import" component={DataExportImport} />
      <Route path="/rbac" component={RBACManagement} />
      <Route path="/advanced-analytics" component={AdvancedAnalytics} />
      <Route path="/collaboration" component={Collaboration} />
      <Route path="/government-integration" component={GovernmentIntegration} />
      <Route path="/3d-visualization" component={Building3DVisualization} />
      <Route path="/mortgage" component={MortgageApplication} />
      <Route path="/marketplace" component={MarketplaceListing} />
      <Route path="/marketplace/:id" component={PropertyDetails} />
      <Route path="/mortgage-application" component={MortgageApplicationPage} />
      <Route path="/mortgage-dashboard" component={MortgageDashboard} />
      <Route path="/loan-officer-dashboard" component={LoanOfficerDashboard} />
      <Route path="/borrower-payment-portal" component={BorrowerPaymentPortal} />
      <Route path="/broker-dashboard" component={BrokerDashboard} />
      <Route path="/investor-dashboard" component={InvestorDashboard} />
      <Route path="/secondary-market" component={InvestorDashboard} />
      <Route path="/regulatory-compliance" component={RegulatoryComplianceDashboard} />
      <Route path="/pooling-scheduler" component={PoolingSchedulerDashboard} />
      <Route path="/commission-management" component={CommissionManagementDashboard} />
      <Route path="/mortgage-analytics" component={MortgageAnalyticsDashboard} />
      <Route path="/webhook-management" component={WebhookManagementDashboard} />
      <Route path="/report-scheduler" component={ReportSchedulerDashboard} />
      <Route path="/report-history" component={ReportHistoryDashboard} />
      <Route path="/webhook-testing" component={WebhookTestingDashboard} />
      <Route path="/integration-health" component={IntegrationHealthDashboard} />
      <Route path="/support-center" component={SupportCenter} />
      <Route path="/marketing-center" component={MarketingCenter} />
      <Route path="/iot-operations" component={IoTOperations} />
      <Route path="/legal-document-center" component={LegalDocumentCenter} />
      <Route path="/civic-compliance-center" component={CivicComplianceCenter} />
      <Route path="/utility-connection-center" component={UtilityConnectionCenter} />
      <Route path="/community-engagement-center" component={CommunityEngagementCenter} />
      <Route path="/heritage-protection-center" component={HeritageProtectionCenter} />
      <Route path="/agricultural-land-center" component={AgriculturalLandCenter} />
      <Route path="/mining-rights-center" component={MiningRightsCenter} />
      <Route path="/coastal-zone-center" component={CoastalZoneCenter} />
      <Route path="/forest-reserve-center" component={ForestReserveCenter} />
      <Route path="/infrastructure-development-center" component={InfrastructureDevelopmentCenter} />
      <Route path="/advanced-geospatial-center" component={AdvancedGeospatialCenter} />
      <Route path="/geolibre-workspace" component={GeoLibreWorkspace} />
      <Route path="/accessibility-center" component={AccessibilityCenter} />
      <Route path="/training-support-center" component={TrainingSupportCenter} />
      <Route path="/data-governance-center" component={DataGovernanceCenter} />
      <Route path="/advanced-search-discovery-center" component={AdvancedSearchDiscoveryCenter} />
      <Route path="/ai-document-processing" component={AIDocumentProcessing} />
      <Route path="/title-risk" component={TitleRiskCopilot} />
      <Route path="/registry-integrity" component={RegistryIntegrityDashboard} />
      <Route path="/command-center" component={CommandCenter} />
      <Route path="/digital-twin" component={ParcelDigitalTwin} />
      <Route path="/drone-processing" component={DroneProcessing} />
      <Route path="/tax-assessment" component={TaxAssessment} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <SkipToContent />
          <Toaster />
          <KeyboardShortcutsDialog />
          <AddToHomeScreenPrompt />
          <Router />
          <MobileBottomNav />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
