// 410 Gone URLs - véglegesen törölt oldalak
const goneUrls = [
  '/partnereim',
  '/partnereim/',
  '/authorgolaxogmail-com',
  '/authorgolaxogmail-com/',
  '/pigmentoff',
  '/pigmentoff/',
  '/pigment-off-tetovalas-eltavolitas',
  '/pigment-off-tetovalas-eltavolitas/',
  '/cdn-cgi/l/email-protection',
  '/comments/feed',
  '/comments/feed/',
  '/i9xo',
  '/i9xo/',
  '/wp-content/uploads/2024/05/Dioda-lezer-2.docx',
  '/wp-content/uploads/2024/07/Dioda-lezer-2024.docx',
];

// 410 Gone HTML oldal
const goneHtml = `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>410 - Az oldal véglegesen törlésre került | Beautyflow</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Open Sans', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #fdf8f6 0%, #fff 50%, #f8f4f9 100%);
      padding: 20px;
    }
    .container {
      text-align: center;
      max-width: 600px;
    }
    .error-code {
      font-family: 'Cormorant', serif;
      font-size: 120px;
      font-weight: 700;
      background: linear-gradient(90deg, #c53f75, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1;
      margin-bottom: 20px;
    }
    h1 {
      font-family: 'Cormorant', serif;
      font-size: 28px;
      color: #1f2937;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    p {
      color: #6b7280;
      font-size: 18px;
      margin-bottom: 32px;
      line-height: 1.6;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 16px 32px;
      background: #c53f75;
      color: white;
      text-decoration: none;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-radius: 9999px;
      transition: all 0.3s ease;
    }
    .btn:hover {
      background: #a33460;
      transform: scale(1.05);
      box-shadow: 0 10px 25px rgba(197, 63, 117, 0.3);
    }
    .btn svg {
      width: 20px;
      height: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-code">410</div>
    <h1>Ez az oldal véglegesen törlésre került</h1>
    <p>A keresett oldal már nem érhető el és nem is fog visszatérni. Kérjük, látogass el a főoldalunkra, ahol megtalálod összes szolgáltatásunkat.</p>
    <a href="/" class="btn">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
      Vissza a főoldalra
    </a>
  </div>
</body>
</html>`;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Check if this URL should return 410 Gone
  if (goneUrls.some(goneUrl => pathname === goneUrl || pathname.startsWith(goneUrl.replace(/\/$/, '') + '/'))) {
    return new Response(goneHtml, {
      status: 410,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  // Continue to next handler
  return context.next();
}
