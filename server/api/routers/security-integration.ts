import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import * as securityService from '../../securityIntegrationService';

export const securityIntegrationRouter = router({
  // OpenCTI Threat Intelligence
  getThreats: protectedProcedure
    .query(async () => {
      return await securityService.getOpenCTIThreats();
    }),

  getIndicators: protectedProcedure
    .query(async () => {
      return await securityService.getOpenCTIIndicators();
    }),

  // Wazuh SIEM
  getAlerts: protectedProcedure
    .input(z.object({
      timeRange: z.enum(['1h', '24h', '7d', '30d']).optional().default('24h')
    }))
    .query(async ({ input }) => {
      return await securityService.getWazuhAlerts(input.timeRange);
    }),

  getAgentStatus: protectedProcedure
    .query(async () => {
      return await securityService.getWazuhAgentStatus();
    }),

  // Open Policy Agent
  getPolicyViolations: protectedProcedure
    .query(async () => {
      return await securityService.getOPAPolicyViolations();
    }),

  getPolicyStats: protectedProcedure
    .query(async () => {
      return await securityService.getOPAPolicyStats();
    }),

  // Kubecost
  getCostData: protectedProcedure
    .input(z.object({
      window: z.enum(['1d', '7d', '30d']).optional().default('7d')
    }))
    .query(async ({ input }: { input: { window: '1d' | '7d' | '30d' } }) => {
      return await securityService.getKubecostCostData(input.window);
    }),

  getCostAnomalies: protectedProcedure
    .query(async () => {
      return await securityService.getKubecostAnomalies();
    }),

  // Unified Security Dashboard Data
  getDashboardData: protectedProcedure
    .query(async () => {
      const [threats, alerts, violations, costAnomalies, agentStatus, policyStats] = await Promise.all([
        securityService.getOpenCTIThreats(),
        securityService.getWazuhAlerts('24h'),
        securityService.getOPAPolicyViolations(),
        securityService.getKubecostAnomalies(),
        securityService.getWazuhAgentStatus(),
        securityService.getOPAPolicyStats()
      ]);

      // Calculate threat level based on alerts and violations
      const highSeverityAlerts = alerts.filter((a: any) => a.rule.level >= 10).length;
      const highSeverityViolations = violations.filter((v: any) => v.severity === 'high' || v.severity === 'critical').length;
      
      let threatLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (highSeverityAlerts + highSeverityViolations > 10) {
        threatLevel = 'critical';
      } else if (highSeverityAlerts + highSeverityViolations > 5) {
        threatLevel = 'high';
      } else if (highSeverityAlerts + highSeverityViolations > 0) {
        threatLevel = 'medium';
      }

      return {
        threatLevel,
        metrics: {
          activeThreats: threats.length,
          totalAlerts: alerts.length,
          highSeverityAlerts,
          policyViolations: violations.length,
          costAnomalies: costAnomalies.length,
          agentStatus
        },
        recentThreats: threats.slice(0, 5),
        recentAlerts: alerts.slice(0, 10),
        recentViolations: violations.slice(0, 10),
        costAnomalies: costAnomalies.slice(0, 5)
      };
    })
});
