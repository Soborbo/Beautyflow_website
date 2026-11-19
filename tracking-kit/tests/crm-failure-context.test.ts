// The CRM lead-webhook is a best-effort leg of /api/contact and /api/boranalizis.
// Its rejection is now reported to the error pipeline (CONTACT-CRM-001 /
// QUIZ-CRM-001); these tests pin the PII-free context that report carries.
import { describe, expect, it } from 'vitest';
import { CrmWebhookError, crmFailureContext } from '../../src/lib/errors/classify';

describe('crmFailureContext', () => {
  it('carries the HTTP status for a non-2xx webhook response', () => {
    const err = new CrmWebhookError(503);
    expect(err.message).toBe('CRM webhook 503');
    expect(crmFailureContext(err)).toEqual({ statusCode: 503, reason: 'http_503' });
  });

  it('reports a network error with null status and the error name + message', () => {
    expect(crmFailureContext(new TypeError('Network connection lost.'))).toEqual({
      statusCode: null,
      reason: 'TypeError: Network connection lost.',
    });
  });

  it('caps the reason length', () => {
    const ctx = crmFailureContext(new Error('x'.repeat(500)));
    expect(ctx.reason.length).toBe(120);
  });
});
