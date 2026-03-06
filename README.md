// CloudFront Function: SPA Rewrite for Published Cruxes
//
// Attach to the "Viewer Request" event on the CloudFront distribution
// serving the published content bucket (crux-garden-published).
//
// S3 paths follow: /{authorId}/{slug}/{filepath}
//
// If a request doesn't have a file extension and has at least two path
// segments (authorId + slug), rewrite it to index.html within that
// crux's prefix. This allows React Router (BrowserRouter) and other
// SPA frameworks to handle client-side routing.

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Split into segments, filtering out empty strings from leading/trailing slashes
  var parts = uri.split('/').filter(function (p) { return p.length > 0; });

  // Need at least authorId and slug
  if (parts.length < 2) {
    return request;
  }

  // If the last segment has a file extension, it's a real file — pass through
  var lastSegment = parts[parts.length - 1];
  if (lastSegment.indexOf('.') > -1) {
    return request;
  }

  // Rewrite to index.html within the crux's prefix
  var authorId = parts[0];
  var slug = parts[1];
  request.uri = '/' + authorId + '/' + slug + '/index.html';

  return request;
}


crux-garden-publish-url-rewrite
