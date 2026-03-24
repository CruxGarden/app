import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import AnimatedBackground from '@/components/layout/AnimatedBackground';

const Shell = lazy(() => import('@/components/layout/Shell'));
const Gateway = lazy(() => import('@/pages/Gateway'));
const HomeGarden = lazy(() => import('@/pages/HomeGarden'));
const CruxBuilder = lazy(() => import('@/pages/CruxBuilder'));
const Settings = lazy(() => import('@/pages/Settings'));
const PublicCrux = lazy(() => import('@/pages/PublicCrux'));
const PublicGarden = lazy(() => import('@/pages/PublicGarden'));
const Explore = lazy(() => import('@/pages/Explore'));
const NotFound = lazy(() => import('@/pages/NotFound'));

// When running inside a workspace preview iframe, the preview system injects
// window.__CRUX_BASENAME__ so the router knows its path prefix
// (e.g. "/__preview/{cruxId}"). Published cruxes use per-crux subdomains
// where the basename is "/", so this only matters for preview mode.
const basename = (window as unknown as { __CRUX_BASENAME__?: string }).__CRUX_BASENAME__ || '/';

const router = createBrowserRouter([
  // Public
  { path: '/', element: <Gateway /> },
  {
    path: '/explore',
    element: (
      <ErrorBoundary>
        <Explore />
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
        path: '/settings',
        element: (
          <ErrorBoundary>
            <Settings />
          </ErrorBoundary>
        ),
      },
    ],
  },

  // Catch-all
  { path: '*', element: <NotFound /> },
], { basename });

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
