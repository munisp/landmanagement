export type JourneyActorRole = "user" | "surveyor" | "registrar" | "admin";
export type JourneySubjectKind =
  | "parcel"
  | "mortgage_application"
  | "registry_case"
  | "collateral_case"
  | "conveyancing_matter"
  | "field_assignment"
  | "row_corridor"
  | "tax_case"
  | "acquisition_dataroom"
  | "exposure_portfolio"
  | "rural_case"
  | "service_request"
  | "property_api_client"
  | "rollout_jurisdiction"
  | "marketplace_listing";

export type JourneyAdapterKey = "validate_subject" | "domain_handoff" | "human_intervention" | "completion_evidence";

export interface JourneyTemplate {
  code: `J${string}`;
  title: string;
  stakeholder: string;
  description: string;
  domain: string;
  allowedRoles: readonly JourneyActorRole[];
  subjectKinds: readonly JourneySubjectKind[];
  interventionRole: "admin" | "registrar" | "surveyor";
  launchRoute: string;
  mobileRoute?: string;
  decisionBoundary: string;
  adapters: readonly JourneyAdapterKey[];
}

const standardAdapters: readonly JourneyAdapterKey[] = [
  "validate_subject",
  "domain_handoff",
  "human_intervention",
  "completion_evidence",
] as const;

export const stakeholderJourneyTemplates: readonly JourneyTemplate[] = [
  { code: "J01", title: "Parcel discovery and public service request", stakeholder: "Citizen", description: "Connect a factual parcel search to an accountable registry-service request.", domain: "registry-operations", allowedRoles: ["user", "registrar", "admin"], subjectKinds: ["parcel"], interventionRole: "registrar", launchRoute: "/search", decisionBoundary: "Only a registry officer may accept or resolve a public service case.", adapters: standardAdapters },
  { code: "J02", title: "Landholding profile and evidence request", stakeholder: "Landholder", description: "Guide an authenticated landholder from parcel context to evidence and assisted support.", domain: "onboarding-verification", allowedRoles: ["user", "admin"], subjectKinds: ["parcel"], interventionRole: "admin", launchRoute: "/getting-started", mobileRoute: "/(tabs)", decisionBoundary: "Identity and document outcomes require configured providers and authorized review.", adapters: standardAdapters },
  { code: "J03", title: "Certificate or title registration preparation", stakeholder: "Applicant", description: "Create an evidence-led handoff into the existing CoFO and registry workflow.", domain: "cofo-registry", allowedRoles: ["user", "registrar", "admin"], subjectKinds: ["parcel"], interventionRole: "registrar", launchRoute: "/cofo-applications", decisionBoundary: "The workflow does not issue a certificate or alter a register.", adapters: standardAdapters },
  { code: "J04", title: "Conveyancing title verification", stakeholder: "Conveyancer", description: "Follow a governed conveyancing matter through evidence and legal-review intervention.", domain: "conveyancing", allowedRoles: ["user", "admin"], subjectKinds: ["conveyancing_matter"], interventionRole: "admin", launchRoute: "/conveyancing-workspace", decisionBoundary: "The journey does not produce legal advice, title conclusions, or registry approval.", adapters: standardAdapters },
  { code: "J05", title: "Mortgage application preparation", stakeholder: "Borrower", description: "Connect an existing mortgage application to verified evidence and lender handoff.", domain: "mortgage", allowedRoles: ["user", "admin"], subjectKinds: ["mortgage_application"], interventionRole: "admin", launchRoute: "/mortgage-application", decisionBoundary: "No credit approval, affordability decision, or payment confirmation is automated.", adapters: standardAdapters },
  { code: "J06", title: "Collateral portfolio review", stakeholder: "Lender", description: "Coordinate a collateral case with provenance and human lender review.", domain: "lender-collateral", allowedRoles: ["user", "admin"], subjectKinds: ["collateral_case"], interventionRole: "admin", launchRoute: "/lender-collateral-control", decisionBoundary: "A human lender retains all underwriting and collateral decisions.", adapters: standardAdapters },
  { code: "J07", title: "Registry case assignment and resolution", stakeholder: "Registry officer", description: "Move an existing Registry Operations Cloud case through accountable review.", domain: "registry-operations", allowedRoles: ["registrar", "admin"], subjectKinds: ["registry_case"], interventionRole: "registrar", launchRoute: "/registry-operations-cloud", decisionBoundary: "Case resolution does not itself alter an authoritative land record.", adapters: standardAdapters },
  { code: "J08", title: "Registry integrity exception review", stakeholder: "Registry integrity analyst", description: "Coordinate a parcel-linked integrity exception with independent review evidence.", domain: "registry-integrity", allowedRoles: ["registrar", "admin"], subjectKinds: ["parcel"], interventionRole: "registrar", launchRoute: "/registry-integrity", decisionBoundary: "Only statutory correction authority may change a record.", adapters: standardAdapters },
  { code: "J09", title: "Field survey assignment and review", stakeholder: "Surveyor", description: "Coordinate an existing field assignment, evidence, and supervisor review.", domain: "field-survey", allowedRoles: ["surveyor", "admin"], subjectKinds: ["field_assignment"], interventionRole: "surveyor", launchRoute: "/field-survey-operations", mobileRoute: "/field-operations", decisionBoundary: "Accepted field evidence does not automatically update a registry record.", adapters: standardAdapters },
  { code: "J10", title: "Right-of-way corridor review", stakeholder: "Infrastructure authority", description: "Coordinate corridor context, findings, and agreement review.", domain: "right-of-way", allowedRoles: ["user", "registrar", "admin"], subjectKinds: ["row_corridor"], interventionRole: "admin", launchRoute: "/right-of-way-manager", decisionBoundary: "No acquisition, easement, or legal agreement is decided by this journey.", adapters: standardAdapters },
  { code: "J11", title: "Human valuation and appeal review", stakeholder: "Assessor", description: "Coordinate a factual tax assessment case and independent review.", domain: "valuation-tax", allowedRoles: ["registrar", "admin"], subjectKinds: ["tax_case"], interventionRole: "registrar", launchRoute: "/valuation-tax-operations", decisionBoundary: "The platform never calculates or issues an automated valuation outcome.", adapters: standardAdapters },
  { code: "J12", title: "Taxpayer assessment, appeal, and payment handoff", stakeholder: "Taxpayer", description: "Guide an existing assessment case toward appeal or provider-verified payment.", domain: "tax-payment", allowedRoles: ["user", "registrar", "admin"], subjectKinds: ["tax_case"], interventionRole: "registrar", launchRoute: "/tax-assessment", decisionBoundary: "Tax assessment and payment status remain authority- and provider-controlled.", adapters: standardAdapters },
  { code: "J13", title: "Acquisition data-room diligence", stakeholder: "Developer or acquirer", description: "Coordinate a governed data room and evidence-led due-diligence handoff.", domain: "acquisition-intelligence", allowedRoles: ["user", "admin"], subjectKinds: ["acquisition_dataroom"], interventionRole: "admin", launchRoute: "/commercial-portfolio", decisionBoundary: "No investment, acquisition, or legal recommendation is generated.", adapters: standardAdapters },
  { code: "J14", title: "Resilience exposure monitoring", stakeholder: "Resilience manager", description: "Coordinate an exposure portfolio with contextual mapping and human mitigation review.", domain: "resilience-exposure", allowedRoles: ["user", "admin"], subjectKinds: ["exposure_portfolio"], interventionRole: "admin", launchRoute: "/commercial-portfolio", decisionBoundary: "Public context feeds are not underwriting, safety, or operational decisions.", adapters: standardAdapters },
  { code: "J15", title: "Rural and agribusiness service request", stakeholder: "Rural landholder or agribusiness", description: "Coordinate consented rural service delivery and provider handoff.", domain: "rural-agribusiness", allowedRoles: ["user", "admin"], subjectKinds: ["rural_case"], interventionRole: "admin", launchRoute: "/commercial-portfolio", decisionBoundary: "Consent and provider acceptance remain explicit and reviewable.", adapters: standardAdapters },
  { code: "J16", title: "Verified provider request and dispute", stakeholder: "Service provider", description: "Coordinate a verified directory request or dispute with accountable review.", domain: "trusted-service-directory", allowedRoles: ["user", "admin"], subjectKinds: ["service_request", "marketplace_listing"], interventionRole: "admin", launchRoute: "/marketplace", decisionBoundary: "The platform does not adjudicate a dispute without an authorized reviewer.", adapters: standardAdapters },
  { code: "J17", title: "Purpose-bound property data integration", stakeholder: "Integration client", description: "Coordinate an API client with purpose, scope, usage, and support handoff.", domain: "property-data-api", allowedRoles: ["user", "admin"], subjectKinds: ["property_api_client"], interventionRole: "admin", launchRoute: "/api-docs", decisionBoundary: "API access remains scoped, rate-limited, and purpose-bound.", adapters: standardAdapters },
  { code: "J18", title: "Sector concession and environmental review", stakeholder: "Concession operator", description: "Coordinate parcel context with mining, oil/gas, concession, and environmental workflows.", domain: "sector-compliance", allowedRoles: ["user", "registrar", "admin"], subjectKinds: ["parcel"], interventionRole: "registrar", launchRoute: "/mining-rights-center", decisionBoundary: "Only the relevant public authority may issue, amend, or revoke a permit.", adapters: standardAdapters },
  { code: "J19", title: "Contextual mapping and GeoAI evidence request", stakeholder: "Planning or public-safety analyst", description: "Coordinate a parcel-linked context and evidence request with analytical review.", domain: "geoai-context-globe", allowedRoles: ["user", "surveyor", "registrar", "admin"], subjectKinds: ["parcel"], interventionRole: "admin", launchRoute: "/context-globe", mobileRoute: "/context", decisionBoundary: "GeoAI and public observations are advisory context, not authoritative land evidence.", adapters: standardAdapters },
  { code: "J20", title: "Jurisdictional rollout assurance", stakeholder: "National or jurisdictional operator", description: "Coordinate rollout readiness, reconciliation, recovery, and assisted-service evidence.", domain: "nationwide-rollout", allowedRoles: ["registrar", "admin"], subjectKinds: ["rollout_jurisdiction"], interventionRole: "registrar", launchRoute: "/admin/nationwide-rollout", decisionBoundary: "Only legal authority and independently accepted evidence can advance rollout status.", adapters: standardAdapters },
] as const;

export const stakeholderJourneyTemplateByCode = new Map(stakeholderJourneyTemplates.map((template) => [template.code, template]));

export function getStakeholderJourneyTemplate(code: string): JourneyTemplate {
  const template = stakeholderJourneyTemplateByCode.get(code as `J${string}`);
  if (!template) throw new Error("Unknown stakeholder journey template");
  return template;
}

export function listStakeholderJourneyTemplatesForRole(role: string): JourneyTemplate[] {
  return stakeholderJourneyTemplates.filter((template) => template.allowedRoles.includes(role as JourneyActorRole));
}
