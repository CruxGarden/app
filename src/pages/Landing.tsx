import { PlasmaProvider, Plasma } from '@cruxgarden/plasma-ui';
import { APP_NAME } from '@/lib/constants';
import '@/components/landing/teaser.css';

/** Mailchimp posts the form directly; no embed script, so nothing third-party runs here. */
const MAILCHIMP_ACTION =
  'https://tech.us13.list-manage.com/subscribe/post?u=4c2e196117cdb095809f3bb3b&id=f31692b207&f_id=008b35e5f0';
/** Mailchimp's bot trap: a real person never fills a field they cannot see. */
const HONEYPOT_FIELD = 'b_4c2e196117cdb095809f3bb3b_f31692b207';

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
export default function Landing() {
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

            {/* target=_blank: Mailchimp's confirmation opens beside the teaser
                rather than replacing it. */}
            <form
              className="teaser-signup"
              action={MAILCHIMP_ACTION}
              method="post"
              name="mc-embedded-subscribe-form"
              target="_blank"
              rel="noopener"
              noValidate
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
          </Plasma>
        </main>
      </PlasmaProvider>
    </div>
  );
}
