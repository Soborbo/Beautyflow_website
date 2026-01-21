import type { APIRoute } from 'astro';
import { Resend } from 'resend';

// Treatment name mapping - Hungarian
const treatmentNamesHu: Record<string, string> = {
  lezer: 'Dióda Lézeres Szőrtelenítés',
  hydra: 'HydraBeauty Arckezelés',
  smink: 'Tartós Sminktetoválás',
  carbon: 'Carbon Peeling',
  tetovalas: 'Lézeres Tetoválás Eltávolítás',
  pigment: 'Pigmentfolt Eltávolítás',
};

// Treatment name mapping - English
const treatmentNamesEn: Record<string, string> = {
  lezer: 'Diode Laser Hair Removal',
  hydra: 'HydraBeauty Facial Treatment',
  smink: 'Permanent Makeup',
  carbon: 'Carbon Peeling',
  tetovalas: 'Laser Tattoo Removal',
  pigment: 'Pigmentation Removal',
};

interface ContactFormData {
  treatments: string[];
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  consent: boolean;
  website: string; // honeypot
  lang?: 'hu' | 'en'; // language
  // Tracking data
  gclid?: string;
  fbclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

// Validate email format
function isValidEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

// Validate phone format
function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  const patterns = [
    /^\+36[0-9]{9}$/,
    /^06[0-9]{9}$/,
    /^[0-9]{9}$/,
    /^36[0-9]{9}$/,
  ];
  return patterns.some((p) => p.test(cleaned));
}

// Format timestamp in Hungarian
function formatTimestamp(): string {
  return new Date().toLocaleString('hu-HU', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Send admin notification email (always in Hungarian for staff)
async function sendAdminEmail(resend: Resend, data: ContactFormData) {
  const treatmentList = data.treatments
    .map((t) => treatmentNamesHu[t] || t)
    .join(', ');

  const langLabel = data.lang === 'en' ? '🇬🇧 English' : '🇭🇺 Magyar';

  await resend.emails.send({
    from: 'Beautyflow.pro <hello@beautyflow.pro>',
    to: 'erdeklodes@beautyflow.pro',
    subject: 'Új visszahíváskérés érkezett a Beautyflow.pro oldalról',
    text: `
Új konzultációs igény érkezett!

Időpont: ${formatTimestamp()}
Nyelv: ${langLabel}

Érdeklődő adatai:
- Név: ${data.lastName} ${data.firstName}
- Telefon: ${data.phone}
- Email: ${data.email}

Érdeklődés tárgya:
${treatmentList}

---
Ez az email automatikusan lett küldve a beautyflow.pro weboldalról.
    `.trim(),
  });
}

// Send user confirmation email (in user's language)
async function sendUserEmail(resend: Resend, data: ContactFormData) {
  const isEnglish = data.lang === 'en';

  if (isEnglish) {
    await resend.emails.send({
      from: 'Fanni Kónya - Beautyflow <hello@beautyflow.pro>',
      to: data.email,
      subject: 'We received your inquiry',
      text: `
Dear ${data.firstName},

Thank you for requesting your free consultation. We will contact you shortly via one of your provided contact details.

Best regards,
Fanni Kónya
Founder of Beautyflow
+36 1 300 9414
      `.trim(),
    });
  } else {
    await resend.emails.send({
      from: 'Kónya Fanni - Beautyflow <hello@beautyflow.pro>',
      to: data.email,
      subject: 'Érdeklődésed megkaptuk',
      text: `
Kedves ${data.firstName}!

Köszönöm, hogy igényelted az ingyenes konzultációdat. Hamarosan meg foglak keresni a megadott elérhetőségeid egyikén.

Üdvözlettel,
Kónya Fanni
a Beautyflow alapítója
+36 1 300 9414
      `.trim(),
    });
  }
}

// Custom base64 encoding (Cloudflare Workers compatible - no btoa)
function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b1 >> 2];
    result += chars[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < len ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < len ? chars[b3 & 63] : '=';
  }
  return result;
}

// Custom base64 decoding (Cloudflare Workers compatible - no atob)
function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  // Remove padding
  let len = base64.length;
  if (base64[len - 1] === '=') len--;
  if (base64[len - 1] === '=') len--;

  const bytes = new Uint8Array((len * 3) >> 2);
  let p = 0;

  for (let i = 0; i < len; i += 4) {
    const c1 = lookup[base64.charCodeAt(i)];
    const c2 = lookup[base64.charCodeAt(i + 1)];
    const c3 = i + 2 < len ? lookup[base64.charCodeAt(i + 2)] : 0;
    const c4 = i + 3 < len ? lookup[base64.charCodeAt(i + 3)] : 0;

    bytes[p++] = (c1 << 2) | (c2 >> 4);
    if (i + 2 < len) bytes[p++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (i + 3 < len) bytes[p++] = ((c3 & 3) << 6) | c4;
  }

  return bytes;
}

// Base64URL encode (Cloudflare Workers compatible - no btoa)
function base64UrlEncode(str: string): string {
  const base64 = bytesToBase64(new TextEncoder().encode(str));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Base64URL encode ArrayBuffer
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

// Convert PEM to CryptoKey
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  // Handle various newline formats from environment variables
  let normalizedKey = pemKey
    .replace(/\\n/g, '\n')  // Handle escaped newlines
    .replace(/\\\\n/g, '\n') // Handle double-escaped newlines
    .trim();

  // Remove PEM header/footer and all whitespace
  const pemContents = normalizedKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/[\s\r\n]/g, '');

  // Decode base64 (Cloudflare Workers compatible - no atob)
  const bytes = base64ToBytes(pemContents);

  return await crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
}

// Create JWT for Google API
async function createGoogleJWT(serviceAccountEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signatureInput)
  );

  const encodedSignature = arrayBufferToBase64Url(signature);

  return `${signatureInput}.${encodedSignature}`;
}

// Get Google access token
async function getGoogleAccessToken(serviceAccountEmail: string, privateKey: string): Promise<string> {
  const jwt = await createGoogleJWT(serviceAccountEmail, privateKey);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Append to Google Sheet using REST API
interface GoogleEnv {
  sheetId?: string;
  serviceAccountEmail?: string;
  privateKey?: string;
}

async function appendToGoogleSheet(data: ContactFormData, googleEnv: GoogleEnv): Promise<void> {
  const { sheetId, serviceAccountEmail, privateKey } = googleEnv;

  // Throw error if credentials are missing - don't silently skip!
  if (!sheetId || !serviceAccountEmail || !privateKey) {
    const missing = [];
    if (!sheetId) missing.push('GOOGLE_SHEETS_ID');
    if (!serviceAccountEmail) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    if (!privateKey) missing.push('GOOGLE_PRIVATE_KEY');
    throw new Error(`Google Sheets credentials missing: ${missing.join(', ')}`);
  }

  // Don't catch errors here - let them propagate to Promise.allSettled
  const accessToken = await getGoogleAccessToken(serviceAccountEmail, privateKey);

  const treatmentList = data.treatments
    .map((t) => treatmentNamesHu[t] || t)
    .join(', ');

  const langLabel = data.lang === 'en' ? 'EN' : 'HU';

  // Build UTM string (combine source/medium/campaign)
  const utmParts = [
    data.utm_source,
    data.utm_medium,
    data.utm_campaign,
  ].filter(Boolean);
  const utmString = utmParts.length > 0 ? utmParts.join(' / ') : '';

  // Extended range to include tracking columns: A:L
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:L:append?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [
        [
          formatTimestamp(),        // A: Időpont
          treatmentList,            // B: Kezelések
          data.lastName,            // C: Vezetéknév
          data.firstName,           // D: Keresztnév
          data.phone,               // E: Telefon
          data.email,               // F: Email
          langLabel,                // G: Nyelv
          data.gclid || '',         // H: GCLID
          data.fbclid || '',        // I: FBCLID
          utmString,                // J: UTM (source/medium/campaign)
          data.utm_content || '',   // K: UTM Content
          data.utm_term || '',      // L: UTM Term
        ],
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Sheets API error: ${error}`);
  }

  console.log('Successfully appended lead to Google Sheet');
}

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;

  try {
    let data: ContactFormData;
    try {
      data = await request.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Érvénytelen kérés formátum.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get Cloudflare runtime environment
    // In Astro 5 + @astrojs/cloudflare 12+, env vars are in locals.runtime.env
    const runtime = (locals as any).runtime;
    const env = runtime?.env || {};

    // Debug logging for troubleshooting
    if (!runtime) {
      console.error('Cloudflare runtime not available. locals keys:', Object.keys(locals));
    } else if (!runtime.env) {
      console.error('Cloudflare runtime.env not available. runtime keys:', Object.keys(runtime));
    }

    // Honeypot check - if filled, silently succeed
    if (data.website) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validation
    if (!data.treatments || data.treatments.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Kérjük válassz legalább egy kezelést.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!data.firstName || data.firstName.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'Kérjük add meg a keresztneved.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!data.lastName || data.lastName.length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: 'Kérjük add meg a vezetékneved.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidPhone(data.phone)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Kérjük adj meg egy érvényes telefonszámot.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidEmail(data.email)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Kérjük adj meg egy érvényes email címet.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!data.consent) {
      return new Response(
        JSON.stringify({ success: false, error: 'Az adatvédelmi szabályzat elfogadása kötelező.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Resend - try multiple sources for API key
    // Priority: Cloudflare runtime env > process.env > import.meta.env
    const resendApiKey =
      env.RESEND_API_KEY ||
      (typeof process !== 'undefined' && process.env?.RESEND_API_KEY) ||
      import.meta.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured.');
      console.error('Available env keys:', Object.keys(env));
      console.error('Runtime available:', !!runtime);
      console.error('Runtime.env available:', !!runtime?.env);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email szolgáltatás nem elérhető. Kérjük hívj minket telefonon: +36 1 300 9414'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(resendApiKey);

    // Get Google Sheets credentials - try multiple sources
    const googleEnv = {
      sheetId:
        env.GOOGLE_SHEETS_ID ||
        (typeof process !== 'undefined' && process.env?.GOOGLE_SHEETS_ID) ||
        import.meta.env.GOOGLE_SHEETS_ID,
      serviceAccountEmail:
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
        (typeof process !== 'undefined' && process.env?.GOOGLE_SERVICE_ACCOUNT_EMAIL) ||
        import.meta.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey:
        env.GOOGLE_PRIVATE_KEY ||
        (typeof process !== 'undefined' && process.env?.GOOGLE_PRIVATE_KEY) ||
        import.meta.env.GOOGLE_PRIVATE_KEY,
    };

    // Send emails and append to sheet in parallel
    try {
      const results = await Promise.allSettled([
        sendAdminEmail(resend, data),
        sendUserEmail(resend, data),
        appendToGoogleSheet(data, googleEnv),
      ]);

      // Check for email failures (first two promises)
      const emailResults = results.slice(0, 2);
      const failedEmails = emailResults.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );

      if (failedEmails.length > 0) {
        const errors = failedEmails.map((r) => r.reason?.message || 'Unknown error');
        console.error('Email sending failed:', errors);

        // If both emails failed, return error
        if (failedEmails.length === 2) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Email küldési hiba: ${errors[0]}`
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        // If only one failed, log but continue (partial success)
        console.warn('Partial email failure, but continuing:', errors);
      }

      // Log Google Sheets result - CRITICAL: This is where leads were being lost silently!
      if (results[2].status === 'rejected') {
        const sheetError = (results[2] as PromiseRejectedResult).reason;
        console.error('🚨 CRITICAL: Google Sheets append FAILED - Lead NOT saved to sheet!');
        console.error('Lead data that was NOT saved:', {
          name: `${data.lastName} ${data.firstName}`,
          email: data.email,
          phone: data.phone,
          treatments: data.treatments,
          timestamp: formatTimestamp(),
        });
        console.error('Error details:', sheetError?.message || sheetError);
      } else {
        console.log('✅ Lead successfully saved to Google Sheets');
      }
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown email error';
      return new Response(
        JSON.stringify({
          success: false,
          error: `Email küldési hiba: ${errorMessage}`
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Contact form error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: `Hiba történt: ${errorMessage}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
