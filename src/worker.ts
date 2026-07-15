/**
 * Egyedi Worker-entry (@astrojs/cloudflare v14 custom entrypoint): az Astro
 * SSR-handler mellé a napi synthetic-lead füstteszt `scheduled()` handlerét
 * exportálja. A wrangler.jsonc `main` erre a fájlra mutat; a cron a
 * `triggers.crons`-ban van. Lásd src/lib/tracking/smoke.ts.
 *
 * A Workers runtime-típusok (ExecutionContext, ScheduledController) itt lokális
 * minimál-alakban vannak — a repo TS-configja nem húzza be a
 * @cloudflare/workers-types ambient neveket.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { runDailySmokeLead } from './lib/tracking/smoke';
import type { GatewayEnv } from './lib/tracking/gateway-dispatch';

interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  async fetch(request: Request, env: unknown, ctx: Ctx): Promise<Response> {
    return handle(request as never, env as never, ctx as never);
  },
  async scheduled(_event: unknown, env: GatewayEnv, ctx: Ctx): Promise<void> {
    ctx.waitUntil(runDailySmokeLead(env));
  },
};
