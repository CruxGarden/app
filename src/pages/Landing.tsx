import { useState } from 'react';
import { PlasmaProvider, Plasma } from '@cruxgarden/plasma-ui';
import { APP_NAME } from '@/lib/constants';
import '@/components/landing/teaser.css';

/** Mailchimp posts the form directly; no embed script, so nothing third-party runs here. */
const MAILCHIMP_ACTION =
  'https://tech.us13.list-manage.com/subscribe/post?u=4c2e196117cdb095809f3bb3b&id=f31692b207&f_id=008b35e5f0';
/** Mailchimp's bot trap: a real person never fills a field they cannot see. */
const HONEYPOT_FIELD = 'b_4c2e196117cdb095809f3bb3b_f31692b207';

const SUBSCRIBED_MESSAGE = 'Thank you, we will notify you at launch.';
/**
 * The form posts into a hidden iframe, so Mailchimp's thank-you page renders
 * out of sight and the visitor never leaves the teaser. That sidesteps the
 * audience's redirect setting entirely, which still points at an old site.
 *
 * The iframe is cross-origin and unreadable, so a submit is treated as sent.
 * With double opt-in that stays honest: the address is only on the list once
 * the confirmation mail is answered, and that mail is what decides.
 *
 * Clicking the link in that mail does navigate. Point the audience's
 * confirmation thank-you page at https://crux.garden/subscribed to land them
 * back here.
 */
const SINK = 'mc-response-sink';

/**
 * Remembers that this browser subscribed, so a return visit — including the
 * one Mailchimp sends after the confirmation mail — shows the thank-you rather
 * than asking again. Per-browser and easily cleared, so it is a courtesy, not
 * a record: the list itself lives at Mailchimp.
 */
const SUBSCRIBED_KEY = 'crux-garden-subscribed';

function rememberSubscribed() {
  try {
    localStorage.setItem(SUBSCRIBED_KEY, new Date().toISOString());
  } catch {
    // Private windows and blocked storage throw; the thank-you still shows for
    // this visit, it just will not survive a reload.
  }
}

function hasSubscribed() {
  try {
    return localStorage.getItem(SUBSCRIBED_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * crux.garden — the teaser. Plasma UI's aurora field, moving on its own behind
 * one liquid glass panel, set to the library's loudest configuration: every
 * motion field open, ambient drops orbiting, a drop trailing the pointer.
 *
 * No background image — omitting it is what leaves the procedural field
 * visible, and the field is the thing that moves.
 *
 * The previous site (pitch, download, Explore, Mood demo) is in git history.
 */
/** `/subscribed` renders the same teaser with the form already answered. */
export default function Landing({ subscribed = false }: { subscribed?: boolean }) {
  // Read once on mount: a reload or a return visit re-reads it anyway.
  const [sent, setSent] = useState(hasSubscribed);
  const answered = subscribed || sent;

  return (
    <div className="teaser">
      <PlasmaProvider
        theme="dark"
        mood="aurora"
        tint="#ffffff"
        opacity={0}
        frost={0.25}
        rimColor="iridescent"
        rim={1.3}
        rimWidth={1.4}
        highlight={1}
        edgeLine={1}
        viscosity={0}
        stretch={2.5}
        flow={2}
        blend={56}
        refraction={1.4}
        dispersion={2.2}
        elevation={0.5}
        ambientDrops
        pointerDrop
      >
        <main className="teaser-stage">
          {/* The panel carries the plate's colour itself: one surface, not a
              solid card floating on glass. No padding prop — it writes an
              inline style that would beat the stylesheet. */}
          <Plasma className="teaser-panel" radius={24} tint="#061016" opacity={0.55} frost={0.5}>
            <h1 className="teaser-title">{APP_NAME}</h1>
            <p className="teaser-line">Grow Anything</p>

            {/* Mailchimp's response lands in here, off-screen and unread. */}
            <iframe name={SINK} title="Subscription response" className="teaser-sink" />
            {answered ? (
              <p className="teaser-sent" role="status">
                {SUBSCRIBED_MESSAGE}
              </p>
            ) : (
              <form
                className="teaser-signup"
                action={MAILCHIMP_ACTION}
                method="post"
                name="mc-embedded-subscribe-form"
                target={SINK}
                onSubmit={() => {
                  rememberSubscribed();
                  setSent(true);
                }}
                data-plasma-nodrag
              >
                <label className="teaser-hidden" htmlFor="mce-EMAIL">
                  Email address
                </label>
                <input
                  className="teaser-email"
                  type="email"
                  name="EMAIL"
                  id="mce-EMAIL"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
                <input type="hidden" name="tags" value="7209613,7209430" />
                {/* Off-screen rather than display:none — bots skip hidden fields. */}
                <div aria-hidden="true" className="teaser-trap">
                  <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} defaultValue="" />
                </div>
                <button className="teaser-submit" type="submit" name="subscribe">
                  Notify me
                </button>
              </form>
            )}
          </Plasma>
        </main>
      </PlasmaProvider>
    </div>
  );
}
