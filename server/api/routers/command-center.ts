import { protectedProcedure, router } from '../../_core/trpc';
import * as commandCenterService from '../../commandCenterService';

export const commandCenterRouter = router({
  forecast: protectedProcedure.query(async () => {
    return commandCenterService.getOperationalForecast();
  }),

  summary: protectedProcedure.query(async () => {
    return commandCenterService.getCommandCenterSummary();
  }),
});
