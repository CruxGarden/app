import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Landing from '@/pages/Landing';
import './teaser-shell.css';

/**
 * The teaser's own entry point.
 *
 * crux.garden serves one page right now, so this build carries one page. It
 * imports Landing and nothing else: no router, no stores, no SQLite, and
 * above all none of the Template Cruxes, whose sources the main bundle pulls
 * in as text and whose toolchains it expects to find installed.
 *
 * Mailchimp returns people to /subscribed, which is the same teaser with the
 * form already answered — one comparison rather than a routing table.
 */
/**
 * Where the page sits decides how the path reads: /subscribed as its own key,
 * /subscribed.html as a plain object, /subscribed/ as a folder index. All three
 * are the same page to the person who just subscribed.
 */
function isSubscribedPath(pathname: string) {
  return pathname.replace(/\.html$/, '').replace(/\/$/, '') === '/subscribed';
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Landing subscribed={isSubscribedPath(window.location.pathname)} />
    </StrictMode>,
  );
}
