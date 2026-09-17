import { useEffect, useState } from 'react';
import { PlasmaProvider, Plasma } from '@cruxgarden/plasma-ui';
import { APP_NAME } from '@/lib/constants';
import TeaserTrack from '@/components/landing/TeaserTrack';
import '@/components/landing/teaser.css';

/** Mailchimp posts the form directly; no embed script, so nothing third-party runs here. */
const MAILCHIMP_ACTION =
  'https://tech.us13.list-manage.com/subscribe/post?u=4c2e196117cdb095809f3bb3b&id=f31692b207&f_id=008b35e5f0';
/** Mailchimp's bot trap: a real person never fills a field they cannot see. */
const HONEYPOT_FIELD = 'b_4c2e196117cdb095809f3bb3b_f31692b207';

const SUBSCRIBED_MESSAGE = 'Thank you, we will notify you at launch';
/**
 * Mailchimp's own flow: the form posts to Mailchimp and Mailchimp redirects
 * back to crux.garden. That redirect carries nothing that says who arrived, so
 * the browser notes the submit on its way out and reads it on the way back in.
 *
 * Per-browser and easily cleared, so it is a courtesy rather than a record:
 * the list itself lives at Mailchimp. Confirming from another device shows the
 * form again, which costs nothing.
 */
const SUBSCRIBED_KEY = 'crux-garden-subscribed';

function rememberSubscribed() {
  try {
    localStorage.setItem(SUBSCRIBED_KEY, new Date().toISOString());
  } catch {
    // Private windows and blocked storage throw. The redirect still lands, it
    // just lands on the form.
  }
}

/**
 * `?reset` forgets the flag and brings the form back. The subscription itself
 * lives at Mailchimp and is untouched; this only clears what this browser
 * remembers, so the page can be looked at again as a first-time visitor.
 */
const RESET_PARAM = 'reset';

function forgetSubscribed() {
  try {
    localStorage.removeItem(SUBSCRIBED_KEY);
  } catch {
    // Same blocked-storage case as above: nothing was stored, so nothing to clear.
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
  // Declared first so the flag is cleared before the read below sees it.
  const [reset] = useState(() => {
    const asked = new URLSearchParams(window.location.search).has(RESET_PARAM);
    if (asked) forgetSubscribed();
    return asked;
  });
  // Read once on mount; a return trip is a fresh load and reads it again.
  const [remembered] = useState(hasSubscribed);
  const answered = !reset && (subscribed || remembered);

  // Landing on /subscribed is itself proof, and it may be the first time this
  // browser has seen the form — someone confirming the mail on their phone.
  // Unless the visit is a deliberate reset, which would otherwise write the
  // flag straight back.
  useEffect(() => {
    if (subscribed && !reset) rememberSubscribed();
  }, [subscribed, reset]);
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
        {/* Its own surface in the corner, outside the centred stage. */}
        <TeaserTrack />

        <main className="teaser-stage">
          {/* The panel carries the plate's colour itself: one surface, not a
              solid card floating on glass. No padding prop — it writes an
              inline style that would beat the stylesheet. */}
          <Plasma
            className="teaser-panel"
            radius={24}
            tint="#061016"
            opacity={0.55}
            frost={0.5}
            draggable
          >
            <h1 className="teaser-title">{APP_NAME}</h1>
            <p className="teaser-line">Grow Anything</p>

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
                target="_self"
                onSubmit={rememberSubscribed}
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
                  placeholder="keeper@crux.garden"
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
