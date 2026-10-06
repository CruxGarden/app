import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const handler = runInNewContext(
  readFileSync(new URL('./public-site-router.js', import.meta.url), 'utf8') + '\nhandler;',
);
test('docs and journal deep links resolve their own HTML; unrelated routes and assets stay unchanged', () => {
  for (const [uri, expected] of [
    ['/docs', '/docs/index.html'],
    ['/docs/', '/docs/index.html'],
    ['/docs/guides/growth/', '/docs/guides/growth/index.html'],
    ['/blog/story', '/blog/story/index.html'],
    ['/docs/pagefind/pagefind.js', '/docs/pagefind/pagefind.js'],
    ['/docs/index.html', '/docs/index.html'],
    ['/docs-elsewhere', '/docs-elsewhere'],
    ['/', '/'],
    ['/explore', '/explore'],
    ['/alice/site/', '/alice/site/'],
  ]) {
    const request = {
      uri,
      querystring: { q: { value: 'Growth' } },
      headers: { host: { value: 'crux.garden' } },
    };
    assert.equal(handler({ request }).uri, expected);
    assert.equal(request.querystring.q.value, 'Growth');
    assert.equal(request.headers.host.value, 'crux.garden');
  }
});
test('the sitemap is handed to the API; pages that only resemble it are left alone', () => {
  const answer = handler({ request: { uri: '/sitemap.xml', querystring: {}, headers: {} } });
  assert.equal(answer.statusCode, 302);
  assert.equal(answer.headers.location.value, 'https://api.crux.garden/explore/sitemap.xml');
  for (const uri of ['/sitemap.xml/', '/alice/sitemap.xml', '/robots.txt', '/terms', '/privacy']) {
    const request = { uri, querystring: {}, headers: {} };
    assert.equal(handler({ request }), request);
    assert.equal(request.uri, uri);
  }
});

test('link-preview crawlers get the preview path; people and assets do not (ADR 0084)', () => {
  const run = (uri, ua) =>
    handler({
      request: {
        uri,
        method: 'GET',
        querystring: {},
        headers: ua ? { 'user-agent': { value: ua } } : {},
      },
    }).uri;
  assert.equal(run('/alice/site', 'Slackbot-LinkExpanding 1.0'), '/~preview/alice/site');
  assert.equal(run('/alice', 'Twitterbot/1.0'), '/~preview/alice');
  assert.equal(run('/alice/site', 'Mozilla/5.0 (Macintosh)'), '/alice/site');
  assert.equal(run('/assets/app.js', 'Twitterbot/1.0'), '/assets/app.js');
  assert.equal(run('/docs/guides', 'Twitterbot/1.0'), '/docs/guides/index.html');
  assert.equal(run('/', 'Twitterbot/1.0'), '/');
});
