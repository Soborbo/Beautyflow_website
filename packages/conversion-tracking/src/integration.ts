/**
 * @leadgen/conversion-tracking - Astro Integration
 *
 * Injects tracking config and init script.
 * NOTE: GTM is loaded manually in Layout.astro (after CookieYes).
 * This integration does NOT inject GTM to avoid race conditions.
 */

import type { AstroIntegration } from 'astro';
import type { TrackingConfig, ResolvedTrackingConfig } from './types';

const DEFAULT_CONFIG: Omit<ResolvedTrackingConfig, 'gtmId'> = {
  currency: 'GBP',
  sessionTimeoutMinutes: 30,
  debug: false,
  linkedDomains: [],
  enableOfflineQueue: true,
};

export default function trackingIntegration(userConfig: TrackingConfig): AstroIntegration {
  const config: ResolvedTrackingConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
  };

  return {
    name: '@leadgen/conversion-tracking',

    hooks: {
      'astro:config:setup': ({ injectScript, logger }) => {
        logger.info('Configuring tracking (GTM loaded manually in Layout.astro)');

        // Google Consent Mode v2 - Script order in Layout.astro:
        // 1. CookieYes (FIRST - handles consent defaults via "Run before banner loads")
        // 2. GTM (manual script in Layout.astro, proxied by Google Tag Gateway)
        // 3. This integration only injects config + init script

        // Tracking config (dataLayer init + config object)
        injectScript(
          'head-inline',
          `window.dataLayer=window.dataLayer||[];window.__TRACKING_CONFIG__=${JSON.stringify({
            currency: config.currency,
            sessionTimeoutMinutes: config.sessionTimeoutMinutes,
            debug: config.debug,
            linkedDomains: config.linkedDomains,
            enableOfflineQueue: config.enableOfflineQueue,
          }).replace(/</g, '\\u003c')};`
        );

        // Inject init script
        injectScript('page', 'import "@leadgen/conversion-tracking/init";');

        if (config.debug) {
          logger.info('Debug mode enabled');
        }
      },

      'astro:build:done': ({ logger }) => {
        logger.info('Tracking integration build complete');
        logger.info(`Currency: ${config.currency}`);
        logger.info(`Session timeout: ${config.sessionTimeoutMinutes} minutes`);
      },
    },
  };
}

export { trackingIntegration as tracking };
export type { TrackingConfig, ResolvedTrackingConfig } from './types';
