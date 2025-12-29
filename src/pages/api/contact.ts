import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { google } from 'googleapis';

// Treatment name mapping
const treatmentNames: Record<string, string> = {
  lezer: 'Dióda Lézeres Szőrtelenítés',
  hydra: 'HydraBeauty Arckezelés',
  smink: 'Tartós Sminktetoválás',
  carbon: 'Carbon Peeling',
  tetovalas: 'Lézeres Tetoválás Eltávolítás',
  pigment: 'Pigmentfolt Eltávolítás',
};

interface ContactFormData {
  treatments: string[];
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  consent: boolean;
  website: string; // honeypot
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

// Send admin notification email
async function sendAdminEmail(resend: Resend, data: ContactFormData) {
  const treatmentList = data.treatments
    .map((t) => treatmentNames[t] || t)
    .join(', ');

  await resend.emails.send({
    from: 'Beautyflow.pro <noreply@beautyflow.pro>',
    to: 'erdeklodes@beautyflow.pro',
    subject: 'Új visszahíváskérés érkezett a Beautyflow.pro oldalról',
    text: `
Új konzultációs igény érkezett!

Időpont: ${formatTimestamp()}

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

// Send user confirmation email
async function sendUserEmail(resend: Resend, data: ContactFormData) {
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

// Append to Google Sheet with env parameters
interface GoogleEnv {
  sheetId?: string;
  serviceAccountEmail?: string;
  privateKey?: string;
}

async function appendToGoogleSheetWithEnv(data: ContactFormData, googleEnv: GoogleEnv) {
  const { sheetId, serviceAccountEmail, privateKey } = googleEnv;

  if (!sheetId || !serviceAccountEmail || !privateKey) {
    console.warn('Google Sheets credentials not configured');
    return;
  }

  try {
    const auth = new google.auth.JWT(
      serviceAccountEmail,
      undefined,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });

    const treatmentList = data.treatments
      .map((t) => treatmentNames[t] || t)
      .join(', ');

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          [
            formatTimestamp(),
            treatmentList,
            data.lastName,
            data.firstName,
            data.phone,
            data.email,
          ],
        ],
      },
    });
  } catch (error) {
    console.error('Failed to append to Google Sheet:', error);
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data: ContactFormData = await request.json();

    // Get Cloudflare runtime environment
    const runtime = (locals as any).runtime;
    const env = runtime?.env || {};

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

    // Initialize Resend - try Cloudflare env first, then fallback to import.meta.env
    const resendApiKey = env.RESEND_API_KEY || import.meta.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured. Cloudflare env:', Object.keys(env));
      return new Response(
        JSON.stringify({ success: false, error: 'Email szolgáltatás nem elérhető. Kérjük hívj minket telefonon.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(resendApiKey);

    // Get Google Sheets credentials from Cloudflare env
    const googleEnv = {
      sheetId: env.GOOGLE_SHEETS_ID || import.meta.env.GOOGLE_SHEETS_ID,
      serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL || import.meta.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: (env.GOOGLE_PRIVATE_KEY || import.meta.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
    };

    // Send emails and append to sheet in parallel
    try {
      await Promise.all([
        sendAdminEmail(resend, data),
        sendUserEmail(resend, data),
        appendToGoogleSheetWithEnv(data, googleEnv),
      ]);
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown email error';
      return new Response(
        JSON.stringify({ success: false, error: `Email küldési hiba: ${errorMessage}` }),
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
