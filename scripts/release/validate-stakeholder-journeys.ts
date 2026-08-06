import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stakeholderJourneyTemplates } from "../../server/stakeholderJourneyTemplates";

const root = resolve(import.meta.dirname, "../..");
const expectedCodes = Array.from({ length: 20 }, (_, index) => `J${String(index + 1).padStart(2, "0")}`);
const standardAdapters = ["validate_subject", "domain_handoff", "human_intervention", "completion_evidence"];

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function source(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function routeToExpoFile(route: string): string {
  if (route === "/(tabs)") return "mobile/app/(tabs)/index.tsx";
  return `mobile/app${route}/index.tsx`;
}

function pwaRouteIsRegistered(appSource: string, route: string): boolean {
  return appSource.includes(`path="${route}"`)
    || appSource.includes(`path={'${route}'}`)
    || appSource.includes(`path={"${route}"}`);
}

const templateCodes = stakeholderJourneyTemplates.map((template) => template.code);
requireCondition(stakeholderJourneyTemplates.length === 20, `Expected 20 templates but found ${stakeholderJourneyTemplates.length}`);
requireCondition(new Set(templateCodes).size === 20, "Journey template codes must be unique");
requireCondition(JSON.stringify(templateCodes) === JSON.stringify(expectedCodes), `Journey codes must be J01 through J20; found ${templateCodes.join(", ")}`);

const pwaApp = source("client/src/App.tsx");
const pwaNavigation = source("client/src/components/DashboardLayout.tsx");
const journeyService = source("server/stakeholderJourneyService.ts");
const mobileMore = source("mobile/src/screens/MoreScreen.tsx");
const daprSubscriptions = source("server/daprSubscriptionHttp.ts");
const portfolioConsumer = source("server/daprPortfolioEventConsumer.ts");
const worker = source("temporal/stakeholderJourneyWorker.ts");
const compose = source("docker-compose.production.yml");
const prometheus = source("monitoring/prometheus.yml");
const journeyAlerts = source("monitoring/stakeholder_journey_alerts.yml");

requireCondition(pwaApp.includes('path="/journeys"'), "PWA /journeys route is not registered");
requireCondition(existsSync(resolve(root, "client/src/pages/StakeholderJourneyHub.tsx")), "PWA StakeholderJourneyHub component is missing");
requireCondition(pwaNavigation.includes('path: "/journeys"') || pwaNavigation.includes("path: '/journeys'"), "PWA navigation does not expose Guided journeys");
requireCondition(existsSync(resolve(root, "mobile/app/journeys/index.tsx")), "Native journey route is missing");
requireCondition(existsSync(resolve(root, "mobile/src/screens/journeys/MobileJourneyHubScreen.tsx")), "Native journey hub screen is missing");
requireCondition(mobileMore.includes('\"/journeys\"') || mobileMore.includes("'/journeys'"), "Native More menu does not link to Guided Journeys");
requireCondition(daprSubscriptions.includes('topic: "portfolio.events"'), "Dapr does not subscribe to portfolio.events");
requireCondition(daprSubscriptions.includes('"/portfolio-events"'), "Dapr portfolio.events receiver route is missing");
requireCondition(portfolioConsumer.includes("journey.middleware_delivery_confirmed"), "Dapr portfolio receipt is not recorded as journey evidence");
requireCondition(portfolioConsumer.includes("never\n * transition a journey") || portfolioConsumer.includes("never\n * transition"), "Dapr portfolio consumer must document its telemetry-only decision boundary");
requireCondition(worker.includes("stakeholder_journey_temporal_worker_up"), "Dedicated journey worker does not expose a readiness metric");
requireCondition(compose.includes("stakeholder-journey-temporal-worker"), "Production Compose does not define the dedicated journey worker");
requireCondition(compose.includes("TEMPORAL_STAKEHOLDER_JOURNEY_TASK_QUEUE"), "Production Compose does not configure the journey task queue");
requireCondition(compose.includes("portfolio-integration-gateway:\n        condition: service_healthy"), "Journey worker is not health-gated on the Go gateway");
requireCondition(compose.includes("portfolio-spatial-engine:\n        condition: service_healthy"), "Journey worker is not health-gated on the Rust spatial engine");
requireCondition(compose.includes("lakehouse-api:\n        condition: service_healthy"), "Journey worker is not health-gated on the Python Lakehouse");
requireCondition(prometheus.includes("stakeholder_journey_alerts.yml"), "Prometheus does not load journey alert rules");
requireCondition(journeyAlerts.includes("StakeholderJourneyWorkerUnavailable"), "Journey worker availability alert is missing");
requireCondition(journeyAlerts.includes("StakeholderJourneyUnexpectedActivityErrorRate"), "Journey orchestration failure-rate alert is missing");

for (const template of stakeholderJourneyTemplates) {
  requireCondition(template.title.trim().length > 0, `${template.code} has no title`);
  requireCondition(template.stakeholder.trim().length > 0, `${template.code} has no stakeholder`);
  requireCondition(template.domain.trim().length > 0, `${template.code} has no domain`);
  requireCondition(template.decisionBoundary.trim().length >= 20, `${template.code} has no meaningful human decision boundary`);
  requireCondition(template.allowedRoles.length > 0, `${template.code} has no authorized role`);
  requireCondition(template.subjectKinds.length > 0, `${template.code} has no subject kind`);
  requireCondition(JSON.stringify(template.adapters) === JSON.stringify(standardAdapters), `${template.code} does not use the standard durable adapters`);
  requireCondition(pwaRouteIsRegistered(pwaApp, template.launchRoute), `${template.code} PWA launch route ${template.launchRoute} is not registered`);

  for (const subjectKind of template.subjectKinds) {
    requireCondition(journeyService.includes(`case "${subjectKind}"`), `${template.code} subject kind ${subjectKind} has no database-backed validator`);
  }

  if (template.mobileRoute) {
    const mobileRouteFile = routeToExpoFile(template.mobileRoute);
    requireCondition(existsSync(resolve(root, mobileRouteFile)), `${template.code} mobile route ${template.mobileRoute} has no Expo route file (${mobileRouteFile})`);
  }
}

const crossLanguageTemplates = {
  rustSpatial: stakeholderJourneyTemplates.filter((template) => ["J10", "J14"].includes(template.code)).map((template) => template.code),
  pythonLakehouse: stakeholderJourneyTemplates.filter((template) => ["J14", "J17", "J19"].includes(template.code)).map((template) => template.code),
};

console.log(JSON.stringify({
  status: "passed",
  templates: templateCodes,
  registeredTemplates: stakeholderJourneyTemplates.length,
  crossLanguageTemplates,
  verified: {
    pwaJourneyHub: true,
    nativeJourneyHub: true,
    subjectValidators: [...new Set(stakeholderJourneyTemplates.flatMap((template) => template.subjectKinds))].length,
    standardAdapters,
    daprPortfolioEvidenceSubscription: true,
    productionWorkerAndAlerts: true,
  },
}, null, 2));
