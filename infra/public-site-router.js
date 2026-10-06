/** CloudFront Function, viewer-request. Attach to the public site's distribution.
 * Keep existing origin/auth rules; this resolves built docs/journal directories,
 * hands /sitemap.xml to the API, which generates it from what is published, and
 * sends known link-preview crawlers to the API's preview HTML (ADR 0084).
 * Copy as-is to a cloudfront-js-2.0 function. It has no deployment side effects here.
 *
 * Link previews: a crawler's page request is rewritten to `/~preview/...`; the
 * origin-request Lambda@Edge `infra/lambda/link-preview-origin.mjs` forwards that
 * to `GET /explore/preview-html`. Deploy the Lambda@Edge before this function,
 * or `/~preview/...` reaches S3. The declarations below mirror
 * `infra/cloudfront/link-preview-viewer.js`; keep the two identical.
 */
var SITEMAP_URL = 'https://api.crux.garden/explore/sitemap.xml';

function handler(event) {
  var request = event.request;
  var preview = linkPreviewRewrite(request);
  if (preview) return preview;
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

var LINK_PREVIEW_PREFIX = '/~preview';

// Lower-case substrings of the User-Agents that fetch a page to draw a link
// card. iMessage identifies as facebookexternalhit/Facebot/Twitterbot.
// Search crawlers (Googlebot, Bingbot, Applebot) run scripts or index the real
// page and are deliberately absent.
var LINK_PREVIEW_AGENTS = [
  'facebookexternalhit',
  'facebot',
  'twitterbot',
  'slackbot',
  'discordbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'skypeuripreview',
  'redditbot',
  'embedly',
  'iframely',
  'pinterestbot',
  'vkshare',
  'mastodon',
  'cardyb',
];

// First path segments the website serves itself (see RESERVED_USERNAMES in
// the API); their static HTML already carries the right card.
var LINK_PREVIEW_SKIP = /^\/(docs|blog|assets|fonts|~preview)(\/|$)/;

function isLinkPreviewAgent(userAgent) {
  var ua = String(userAgent || '').toLowerCase();
  if (!ua) return false;
  for (var i = 0; i < LINK_PREVIEW_AGENTS.length; i++) {
    if (ua.indexOf(LINK_PREVIEW_AGENTS[i]) !== -1) return true;
  }
  return false;
}

/** A page of the client-rendered site: not the root, not a file, not a static section. */
function isLinkPreviewPage(uri) {
  if (typeof uri !== 'string' || uri.charAt(0) !== '/' || uri === '/') return false;
  if (uri.length > 512) return false;
  if (/\.[^/]+$/.test(uri)) return false;
  return !LINK_PREVIEW_SKIP.test(uri);
}

/**
 * Returns nothing for ordinary requests (the caller carries on); for a
 * crawler's page request, rewrites `request.uri` and returns the request.
 */
function linkPreviewRewrite(request) {
  var header = request.headers && request.headers['user-agent'];
  if (request.method && request.method !== 'GET' && request.method !== 'HEAD') return undefined;
  if (!header || !isLinkPreviewAgent(header.value)) return undefined;
  if (!isLinkPreviewPage(request.uri)) return undefined;
  request.uri = LINK_PREVIEW_PREFIX + request.uri;
  return request;
}
