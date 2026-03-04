/**
 * @leadgen/conversion-tracking - Astro Integration
 *
 * Injects GTM, tracking config, and init script into every page.
 * CookieYes CMP is loaded as a GTM tag with consent defaults.
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
        logger.info(`Injecting GTM (${config.gtmId}) + tracking config into all pages`);

        // 1. GTM snippet — loads on every page via integration (not Layout.astro)
        //    CookieYes CMP + Consent Mode v2 defaults are handled inside GTM
        injectScript(
          'head-inline',
          `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':` +
          `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],` +
          `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=` +
          `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
          `})(window,document,'script','dataLayer','${config.gtmId}');`
        );

        // 2. Tracking config (dataLayer init + config object)
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

        // 3. Init script (session, attribution, remarketing, etc.)
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
