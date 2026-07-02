/**
 * Cloudflare Turnstile server-side validation.
 *
 * Reference: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * The secret key is set as a Workers secret (TURNSTILE_SECRET_KEY). The
 * site key is exposed publicly via PUBLIC_TURNSTILE_SITE_KEY at build time.
 */

interface TurnstileVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
  action?: string;
  cdata?: string;
}

export interface TurnstileVerifyResult {
  success: boolean;
  errors?: string[];
  hostname?: string;
}

/**
 * Verifies a Turnstile token with the Cloudflare API.
 *
 * @param token - The cf-turnstile-response from the widget
 * @param secretKey - The Turnstile secret key (server-only)
 * @param remoteIp - Optional client IP (CF-Connecting-IP header)
 */
export async function verifyTurnstile(
  token: string,
  secretKey: string,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> {
  if (!token) {
    return { success: false, errors: ['missing-input-response'] };
  }
  if (!secretKey) {
    return { success: false, errors: ['missing-secret'] };
  }

  const formData = new FormData();
  formData.append('secret', secretKey);
  formData.append('response', token);
  if (remoteIp) formData.append('remoteip', remoteIp);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const data = (await res.json()) as TurnstileVerifyResponse;
    return {
      success: data.success === true,
      errors: data['error-codes'],
      hostname: data.hostname,
    };
  } catch (err) {
    return {
      success: false,
      errors: ['network-error', err instanceof Error ? err.message : 'unknown'],
    };
  }
}
