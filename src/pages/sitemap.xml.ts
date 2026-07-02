// Redirect /sitemap.xml to /sitemap-index.xml
// Dynamic endpoint (not prerendered) to provide proper 301 redirect
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ site }) => {
  const sitemapIndexUrl = new URL('/sitemap-index.xml', site || 'https://beautyflow.pro');

  return new Response(null, {
    status: 301,
    headers: {
      'Location': sitemapIndexUrl.href,
    }
  });
};
