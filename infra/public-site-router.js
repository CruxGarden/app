/** CloudFront Function, viewer-request. Attach to the public site's distribution.
 * Keep existing origin/auth rules; this only resolves built docs/journal directories.
 * Copy as-is to a cloudfront-js-2.0 function. It has no deployment side effects here.
 */
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (/^\/(docs|blog)(\/|$)/.test(uri) && !/\.[^/]+$/.test(uri)) {
    request.uri = uri.replace(/\/$/, '') + '/index.html';
  }
  return request;
}
