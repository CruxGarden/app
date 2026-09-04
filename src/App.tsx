import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { isPublicSite } from '@/lib/site';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import AnimatedBackground from '@/components/layout/AnimatedBackground';

const Shell = lazy(() => import('@/components/layout/Shell'));
const Gateway = lazy(() => import('@/pages/Gateway'));
const Landing = lazy(() => import('@/pages/Landing'));
const BillingReturn = lazy(() => import('@/pages/BillingReturn'));
const HomeGarden = lazy(() => import('@/pages/HomeGarden'));
const CruxBuilder = lazy(() => import('@/pages/CruxBuilder'));
const MoodBuilder = lazy(() => import('@/pages/MoodBuilder'));
const PublicCrux = lazy(() => import('@/pages/PublicCrux'));
const PublicGarden = lazy(() => import('@/pages/PublicGarden'));
const ExplorePage = lazy(() => import('@/pages/Explore').then((m) => ({ default: m.ExplorePage })));
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
    {
      path: '/',
      element: <ErrorBoundary>{publicSite ? <Landing /> : <Gateway />}</ErrorBoundary>,
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
          { path: '/mood', element: <Navigate to="/" replace /> },
        ]
      : []),
    {
      element: <Shell />,
      children: [
        {
          path: '/home',
          element: (
            <ErrorBoundary>
              <HomeGarden />
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
        {
          path: '/mood',
          element: (
            <ErrorBoundary>
              <MoodBuilder />
            </ErrorBoundary>
          ),
        },
      ],
    },

    // Catch-all
    { path: '*', element: <NotFound /> },
  ],
  { basename },
);

export default function App() {
  return (
    <ErrorBoundary>
      <AnimatedBackground />
      <Suspense fallback={null}>
        <RouterProvider router={router} />
      </Suspense>
    </ErrorBoundary>
  );
}
