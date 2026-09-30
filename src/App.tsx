import { lazy, Suspense, useSyncExternalStore } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { registerNavigator } from '@/lib/navigate';
import PlasmaStage from '@/components/plasma/PlasmaStage';
import PlasmaSurfaces from '@/components/plasma/PlasmaSurfaces';
import { isPublicSite } from '@/lib/site';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import TitleTooltips from '@/components/ui/TitleTooltips';
import Toaster from '@/components/ui/Toaster';
import AnimatedBackground from '@/components/layout/AnimatedBackground';

const Shell = lazy(() => import('@/components/layout/Shell'));
const Gateway = lazy(() => import('@/pages/Gateway'));
const Landing = lazy(() => import('@/pages/Landing'));
const BillingReturn = lazy(() => import('@/pages/BillingReturn'));
const Plans = lazy(() => import('@/pages/Plans'));
const GardenWorkspace = lazy(() => import('@/components/workspace/GardenWorkspace'));
const CruxBuilder = lazy(() => import('@/pages/CruxBuilder'));
const PublicCrux = lazy(() => import('@/pages/PublicCrux'));
const PublicGarden = lazy(() => import('@/pages/PublicGarden'));
const ExplorePage = lazy(() => import('@/pages/Explore').then((m) => ({ default: m.ExplorePage })));
const StaticPublication = lazy(() => import('@/pages/StaticPublication'));
const NotFound = lazy(() => import('@/pages/NotFound'));

// When running inside a workspace preview iframe, the preview system injects
// window.__CRUX_BASENAME__ so the router knows its path prefix
// (e.g. "/__preview/{cruxId}"). Published cruxes use per-crux subdomains
// where the basename is "/", so this only matters for preview mode.
const basename = (window as unknown as { __CRUX_BASENAME__?: string }).__CRUX_BASENAME__ || '/';

// crux.garden (VITE_PUBLIC_SITE=1): `/` is the website and the browser builder
// routes are withdrawn — the product is the desktop app. Web Mode stays for dev.
const publicSite = isPublicSite();

const router = createBrowserRouter(
  [
    // Public
    { path: '/docs/*', element: <StaticPublication /> },
    { path: '/blog/*', element: <StaticPublication /> },
    {
      path: '/',
      element: <ErrorBoundary>{publicSite ? <Landing /> : <Gateway />}</ErrorBoundary>,
    },
    // Where Mailchimp returns people after they subscribe: the same teaser with
    // the form already answered. Only the public site has it.
    ...(publicSite
      ? [
          {
            path: '/subscribed',
            element: (
              <ErrorBoundary>
                <Landing subscribed />
              </ErrorBoundary>
            ),
          },
        ]
      : []),
    {
      path: '/plans',
      element: (
        <ErrorBoundary>
          <Plans />
        </ErrorBoundary>
      ),
    },
    {
      path: '/billing/:outcome',
      element: (
        <ErrorBoundary>
          <BillingReturn />
        </ErrorBoundary>
      ),
    },
    {
      path: '/explore',
      element: (
        <ErrorBoundary>
          <ExplorePage />
        </ErrorBoundary>
      ),
    },
    {
      path: '/:username/:slug/*',
      element: (
        <ErrorBoundary>
          <PublicCrux />
        </ErrorBoundary>
      ),
    },
    {
      path: '/:username',
      element: (
        <ErrorBoundary>
          <PublicGarden />
        </ErrorBoundary>
      ),
    },

    // App
    ...(publicSite
      ? [
          { path: '/home', element: <Navigate to="/" replace /> },
          { path: '/c/:id', element: <Navigate to="/" replace /> },
        ]
      : []),
    {
      element: <Shell />,
      children: [
        {
          path: '/home',
          element: (
            <ErrorBoundary>
              <GardenWorkspace />
            </ErrorBoundary>
          ),
        },
        {
          path: '/c/:id',
          element: (
            <ErrorBoundary>
              <CruxBuilder />
            </ErrorBoundary>
          ),
        },
      ],
    },

    // Catch-all
    { path: '*', element: <NotFound /> },
  ],
  { basename },
); // Services (the Keeper's run_turn) navigate through here, without importing the router.
registerNavigator((path) => router.navigate(path));

const subscribeRoute = (changed: () => void) => router.subscribe(changed);
// Entry pages own the teaser material; keep the workspace provider mounted,
// but give its canvas no work until the person enters the app.
const onEntryPage = () =>
  router.state.location.pathname === '/' ||
  (publicSite && router.state.location.pathname === '/subscribed');

export default function App() {
  const entry = useSyncExternalStore(subscribeRoute, onEntryPage);
  return (
    <ErrorBoundary>
      {!entry && <AnimatedBackground />}
      {/* Above the router, not inside Shell. Only two routes are Shell's
          children — /home and /c/:id — so a material mounted
          there left the Gateway, Explore, Plans, the public pages and the
          404 flat. Entry pages supply their own shared teaser material. */}
      <TitleTooltips />
      <Toaster />
      <PlasmaStage enabled={!entry}>
        <PlasmaSurfaces />
        <Suspense fallback={null}>
          <RouterProvider router={router} />
        </Suspense>
      </PlasmaStage>
    </ErrorBoundary>
  );
}
