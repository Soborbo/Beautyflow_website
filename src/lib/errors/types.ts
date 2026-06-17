// src/lib/errors/types.ts
// Shared types for the error-code catalogue (codes.ts / catalogue.ts).

/** Ordered least → most urgent. The centralised Tail Worker
 *  (soborbo-error-pipeline) resolves throttling + email routing from this. */
export type Severity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

/** How the end user is affected when a code fires. */
export type UserImpact = 'none' | 'degraded' | 'blocked';

export interface ErrorCodeDef {
  severity: Severity;
  retryable: boolean;
  userImpact: UserImpact;
  message: string;
  /** Context keys that MUST be present when this code is reported.
   *  reportServerError() emits a dev-only warning if any are missing. */
  requiredContext: string[];
}
