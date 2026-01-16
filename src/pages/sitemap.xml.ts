// Redirect /sitemap.xml to /sitemap-index.xml
// Dynamic endpoint (not prerendered) to provide proper 301 redirect
export const prerender = false;

export async function GET({ site }) {
  const sitemapIndexUrl = new URL('/sitemap-index.xml', site || 'https://beautyflow.pro');

  return new Response(null, {
    status: 301,
    headers: {
      'Location': sitemapIndexUrl.href,
    }
  });
}
