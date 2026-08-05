import { adminProcedure, router } from "../../_core/trpc";
import { runIntegrationReadinessPreflight } from "../../integrationReadinessService";

/** Administrator-only operational readiness for identity, authorization, verification, and workflow dependencies. */
export const integrationReadinessRouter = router({
  preflight: adminProcedure.query(async () => runIntegrationReadinessPreflight()),
});
