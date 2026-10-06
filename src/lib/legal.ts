// Needs Daniel's legal review (2026-10-05): subscriptions, refunds, plan end
// and usage limits were added from the customer review (ROADMAP § Customer
// review, CR10) and describe what the code does, not reviewed legal wording.
import { GITHUB_APP_URL, type LegalPath } from './site';

/**
 * The words on /terms, /privacy and /contact. Plain language, and only what the
 * product does: every claim here is checked against the code and the ADRs
 * (0008 no analytics, 0044/0076 included inference, 0012 Stripe). No company
 * name, postal address, jurisdiction or email address is stated, because none
 * has been decided in this repository; contact details come from the build
 * (`contactTarget()` in site.ts).
 *
 * Change the text → change LEGAL_LAST_UPDATED.
 */
export const LEGAL_LAST_UPDATED = '2026-10-05';

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  list?: string[];
  /** Paragraphs that follow the list. */
  after?: string[];
  links?: { label: string; href: string }[];
}

export interface LegalDocument {
  path: LegalPath;
  title: string;
  /** One sentence; also the page's meta description. */
  summary: string;
  sections: LegalSection[];
}

export const LICENSE_URL = `${GITHUB_APP_URL}/blob/main/LICENSE`;

export const TERMS: LegalDocument = {
  path: '/terms',
  title: 'Terms',
  summary:
    'The terms for using the Crux Garden app, the crux.garden website and the hosted services behind them.',
  sections: [
    {
      heading: 'What these terms cover',
      paragraphs: [
        'Crux Garden is a desktop app for making things, and crux.garden is where you can publish them. These terms cover the app, this website and the hosted services: accounts, publishing, backups and included collaboration. “We” means the people who run crux.garden.',
        'You can use the app on your own device without an account. An account is only needed for the hosted services.',
      ],
    },
    {
      heading: 'The app is open source',
      paragraphs: [
        'The Crux Garden app is released under the MIT License. You may use, copy, change and share it under that license. Tools and libraries included with the app keep their own licenses.',
      ],
      links: [{ label: 'Read the MIT License', href: LICENSE_URL }],
    },
    {
      heading: 'Your account',
      paragraphs: [
        'You sign in with an email address and a one-time code. Keep access to that email: it is how you prove the account is yours. Your username is your public address on crux.garden. We may refuse or reclaim a username that impersonates someone or that the website needs for its own pages.',
      ],
    },
    {
      heading: 'What you make is yours',
      paragraphs: [
        'You keep ownership of everything you make and publish. Publishing gives us permission to store your creation, copy it as needed to deliver it, and show it at its public address, and in Explore if you choose to list it, until you unpublish it or close your account.',
        'If you publish the conversation that made a creation, visitors can read it under “How this was made”. Copies that other people downloaded while a creation was public remain theirs.',
      ],
    },
    {
      heading: 'What you may not publish',
      paragraphs: ['Do not use crux.garden to publish or send:'],
      list: [
        'anything illegal, or anything that exploits or sexualises children;',
        'content that infringes someone else’s copyright, trademark or privacy;',
        'harassment, threats or content meant to incite violence against people;',
        'malware, phishing, or pages that deceive visitors into giving up credentials or money;',
        'spam, or pages that exist only to manipulate search engines;',
        'anything that attacks the service, gets around plan limits, or disrupts other people’s creations.',
      ],
    },
    {
      heading: 'Your visitors',
      paragraphs: [
        'A published creation can collect information from its visitors, for example through a form, a guestbook or visitor sign-in. You are responsible for what your creation collects and for telling your visitors what you do with it.',
      ],
    },
    {
      heading: 'Reports and removal',
      paragraphs: [
        'Anyone can report a published creation with the Report action on its page, including for copyright. We review reports and may unlist or remove content, or close an account, when these terms are broken. We may act without notice when the content is harmful or the law requires it.',
      ],
    },
    {
      heading: 'Plans and billing',
      paragraphs: [
        'The app and basic publishing are free. Paid plans add hosting room, your own domains and included collaboration, and are billed monthly or yearly through Stripe. Stripe handles the payment; your card details never reach Crux Garden. Your own provider key works on every plan.',
      ],
      links: [{ label: 'See plans and prices', href: '/plans' }],
    },
    {
      heading: 'Subscriptions and auto-renewal',
      paragraphs: [
        'A paid plan renews automatically at the end of each monthly or yearly period until you cancel. You can cancel at any time from Manage billing in Settings → Plan. When you cancel, your plan stays active until the end of the period you have paid for and does not renew.',
      ],
    },
    {
      heading: 'Refunds',
      paragraphs: [
        'We do not refund part of a period, including when you cancel or switch plans part-way through, except where the law requires it. Closing your account ends any plan immediately, without a refund for the remaining time.',
      ],
    },
    {
      heading: 'When a plan ends',
      paragraphs: [
        'When a paid plan ends, your account moves to Free. Published work stays online within the Free limits. Custom domains you already connected stay connected; connecting a new domain needs a paid plan. If your storage is above twice the Free limit, new uploads and publishes pause until you make room or choose a plan again.',
      ],
    },
    {
      heading: 'Usage limits',
      list: [
        'Hosting limits (storage, visits and Crux Store requests) are counted per calendar month and reset on the 1st of each month, UTC.',
        'Included collaboration is limited over two rolling windows, the last 5 hours and the last 30 days; allowance returns as earlier requests age out.',
        'Near its limits, included collaboration may give shorter replies, and it pauses when the next request cannot fit. Your own provider key is not affected.',
        'There are no overage charges. Reaching a limit never adds to your bill.',
      ],
    },
    {
      heading: 'Working with AI models',
      paragraphs: [
        'AI is optional. If you use your own provider key, your use of that provider is under your agreement with them. If you use included collaboration, your requests are passed to the model provider on your behalf. Models make mistakes: review what is made before you rely on it or publish it. You are responsible for what you publish.',
      ],
    },
    {
      heading: 'Closing your account',
      paragraphs: [
        'You can close your hosted account at any time from Settings → Account in the app. Your public Garden, published creations and hosted backups are removed, and any subscription ends immediately without a refund for the remaining time. We email you links to your recent invoices when the account closes. Everything on your own device stays where it is.',
      ],
    },
    {
      heading: 'No warranty',
      paragraphs: [
        'The app and the hosted services are provided “as is”, without warranty of any kind, as far as the law allows. We work to keep the service running and your published creations available, but we do not promise that it will be uninterrupted or free of errors. Keep your own copies of work that matters to you; your local Garden is yours to back up.',
        'As far as the law allows, we are not liable for lost data, lost profits or indirect damages arising from your use of the app or the service.',
      ],
    },
    {
      heading: 'Changes to these terms',
      paragraphs: [
        'When these terms change, the date at the top of this page changes with them. Continuing to use the hosted services after a change means you accept the new terms.',
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  path: '/privacy',
  title: 'Privacy',
  summary:
    'What Crux Garden keeps on your device, what the hosted account stores, and what is never collected.',
  sections: [
    {
      heading: 'The short version',
      list: [
        'Your work lives on your device. The app works without an account.',
        'There are no usage analytics and no advertising trackers in the app or on this website.',
        'The hosted account stores only what it needs to sign you in, publish what you choose, back up what you ask it to, and bill a paid plan.',
      ],
    },
    {
      heading: 'What stays on your device',
      paragraphs: [
        'Your projects, files, edit history, conversations, settings and any AI provider keys you enter are stored on your own device. They are not uploaded unless you publish a creation or turn on backup.',
        'The desktop app writes error logs to a file on your device so you can inspect them or attach them to a bug report. It does not send them anywhere on its own. The app checks for updates against its public releases on GitHub; you can turn that off in Settings.',
      ],
    },
    {
      heading: 'Working with AI models',
      list: [
        'Your own provider key: requests go directly from your device to the provider you chose. They do not pass through Crux Garden.',
        'A model running on your device: nothing leaves your device.',
        'Included collaboration on a paid plan: your conversation and the context you select pass through the Crux Garden API to the model provider (Anthropic for conversation; OpenAI for included images, which receive only the prompt and any reference image you select). We keep a usage ledger for your allowance: the model, token counts, cost, timestamps, whether the request completed and which of your Cruxes it was for. The ledger does not contain your conversation.',
      ],
      after: ['AI is optional, and turning it off keeps all of these paths closed.'],
    },
    {
      heading: 'What the hosted account stores',
      list: [
        'Your email address, used to send sign-in codes and service messages about your account.',
        'Your public profile: username, display name, bio and avatar.',
        'What you publish: the files of each creation, its title, description and tags, and the conversation that made it when you publish that too.',
        'Backups of your Garden, only if you turn backup on.',
        'Data your published creations save to the Crux Store, and any custom domains you connect.',
        'Your plan, and usage totals such as storage, bandwidth and request counts.',
      ],
      after: [
        'Hosted data is stored with Amazon Web Services, which also delivers published creations and sign-in emails.',
      ],
    },
    {
      heading: 'Billing',
      paragraphs: [
        'Paid plans are billed by Stripe. Stripe collects and holds your payment details; card numbers never reach Crux Garden. We keep the Stripe customer and subscription references and your plan status so the app knows what your plan includes.',
      ],
    },
    {
      heading: 'Visitors to published creations',
      paragraphs: [
        'Published creations are delivered through a content delivery network whose access logs we read to measure bandwidth and to count visitors. To count a visitor, the IP address and browser name from a log line are hashed together with the date and a secret into a token that only says “same visitor, same day”. The address itself is not kept, the tokens cannot be linked from one day to the next, and they are deleted after about 100 days. The daily totals remain.',
        'A creation may offer its own visitor sign-in, forms or guestbook. What visitors enter there is stored for that creation and is available to its creator.',
      ],
    },
    {
      heading: 'This website',
      paragraphs: [
        'crux.garden sets no advertising or analytics cookies. It remembers a few preferences, such as the music volume, in your browser’s own storage. If you ask to be notified at launch, your email address is sent to Mailchimp, which keeps that list.',
        'If you report a published creation, we store the reason, the details you write and your email address if you give one, so the report can be reviewed.',
      ],
    },
    {
      heading: 'Closing your account',
      paragraphs: [
        'Close your hosted account from Settings → Account in the app. This removes your public Garden, published creations, tools and Moods, custom-domain routes and hosted backups, and stops any subscription. Copies cached by the delivery network can take time to disappear, and some operational and billing records may be retained for a period after closure. Your local Garden is not touched.',
      ],
    },
    {
      heading: 'Changes to this page',
      paragraphs: [
        'When what we collect changes, this page changes first, and the date at the top changes with it.',
      ],
    },
  ],
};

export const CONTACT: LegalDocument = {
  path: '/contact',
  title: 'Contact',
  summary: 'How to reach the people who run Crux Garden.',
  sections: [
    {
      heading: 'Report a published creation',
      paragraphs: [
        'To report something published on crux.garden, open the creation and choose Report at the top of its page. That reaches us with the address of the creation attached.',
      ],
    },
    {
      heading: 'Problems and ideas',
      paragraphs: [
        'The app is developed in the open. Bugs and requests are tracked as GitHub issues, where you can also see what others have reported.',
      ],
      links: [{ label: 'Open an issue on GitHub', href: `${GITHUB_APP_URL}/issues` }],
    },
    {
      heading: 'Your account and billing',
      paragraphs: [
        'Plans are managed in the app under Settings → Plan, and an account is closed under Settings → Account. Do not put account details in a public issue.',
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalPath, LegalDocument> = {
  '/terms': TERMS,
  '/privacy': PRIVACY,
  '/contact': CONTACT,
};

/** 2026-10-04 → 4 October 2026, the same everywhere regardless of locale. */
export function formatLegalDate(iso: string): string {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${day} ${months[month - 1]} ${year}`;
}
