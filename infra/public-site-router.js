/** CloudFront Function, viewer-request. Attach to the public site's distribution.
 * Keep existing origin/auth rules; this resolves built docs/journal directories
 * and hands /sitemap.xml to the API, which generates it from what is published.
 * Copy as-is to a cloudfront-js-2.0 function. It has no deployment side effects here.
 *
 * It cannot give each published creation its own link preview: a CloudFront
 * Function sees the request only, has no network access and cannot rewrite the
 * HTML body. That needs an origin-request Lambda@Edge (or an API route) that
 * answers known link-preview crawlers with a small HTML document carrying the
 * creation's title, description and cover image.
 */
var SITEMAP_URL = 'https://api.crux.garden/explore/sitemap.xml';

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri === '/sitemap.xml') {
    // A redirect, not an origin switch: no second origin or cache behaviour to
    // configure, and crawlers follow it. robots.txt names this address.
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: {
        location: { value: SITEMAP_URL },
        'cache-control': { value: 'public, max-age=3600' },
      },
    };
  }
  if (/^\/(docs|blog)(\/|$)/.test(uri) && !/\.[^/]+$/.test(uri)) {
    request.uri = uri.replace(/\/$/, '') + '/index.html';
  }
  return request;
}
