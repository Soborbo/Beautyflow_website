/**
 * @leadgen/conversion-tracking - Astro Integration
 *
 * Auto-injects GTM and tracking initialization.
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

function validateConfig(config: TrackingConfig): void {
  if (config.gtmId && !config.gtmId.startsWith('GTM-')) {
    console.warn(`[@leadgen/conversion-tracking] gtmId should start with "GTM-". Got: "${config.gtmId}"`);
  }
}

export default function trackingIntegration(userConfig: TrackingConfig): AstroIntegration {
  validateConfig(userConfig);

  const config: ResolvedTrackingConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
  };

  return {
    name: '@leadgen/conversion-tracking',

    hooks: {
      'astro:config:setup': ({ injectScript, logger }) => {
        if (config.gtmId) {
          logger.info(`Configuring tracking with GTM ID: ${config.gtmId}`);
        } else {
          logger.info('Configuring tracking without GTM (Zaraz-only mode)');
        }

        // STEP 1: Google Consent Mode v2 - Default consent state
        // CRITICAL: Must be in SEPARATE script tag, runs FIRST before any other scripts
        injectScript(
          'head-inline',
          `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{'ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied','analytics_storage':'denied','functionality_storage':'denied','personalization_storage':'denied','security_storage':'granted','wait_for_update':500});`
        );

        // STEP 2: Tracking config (separate script tag)
        injectScript(
          'head-inline',
          `window.__TRACKING_CONFIG__=${JSON.stringify({
            gtmId: config.gtmId || '',
            currency: config.currency,
            sessionTimeoutMinutes: config.sessionTimeoutMinutes,
            debug: config.debug,
            linkedDomains: config.linkedDomains,
            enableOfflineQueue: config.enableOfflineQueue,
          }).replace(/</g, '\\u003c')};`
        );

        // STEP 3: GTM script (separate script tag, AFTER consent defaults)
        if (config.gtmId) {
          injectScript(
            'head-inline',
            `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${config.gtmId}');`
          );
        }

        // Inject init script
        injectScript('page', 'import "@leadgen/conversion-tracking/init";');

        if (config.debug) {
          logger.info('Debug mode enabled');
        }
      },

      'astro:build:done': ({ logger }) => {
        logger.info('Tracking integration build complete');
        logger.info(`GTM ID: ${config.gtmId}`);
        logger.info(`Currency: ${config.currency}`);
        logger.info(`Session timeout: ${config.sessionTimeoutMinutes} minutes`);
      },
    },
  };
}

export { trackingIntegration as tracking };
export type { TrackingConfig, ResolvedTrackingConfig } from './types';
