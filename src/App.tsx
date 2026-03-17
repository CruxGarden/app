import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

const AppShell = lazy(() => import('@/components/layout/AppShell'));
const Landing = lazy(() => import('@/pages/Landing'));
const Login = lazy(() => import('@/pages/Login'));
const Garden = lazy(() => import('@/pages/Garden'));
const CruxPage = lazy(() => import('@/pages/Crux'));
const Settings = lazy(() => import('@/pages/Settings'));
const PublicCrux = lazy(() => import('@/pages/PublicCrux'));
const PublicAuthor = lazy(() => import('@/pages/PublicAuthor'));
const Discover = lazy(() => import('@/pages/Discover'));
const NotFound = lazy(() => import('@/pages/NotFound'));

// When running inside a Crux Garden preview or published at a subdirectory,
// the preview system injects window.__CRUX_BASENAME__ so the router knows
// its path prefix (e.g. "/__preview/{cruxId}" or "/{authorId}/{cruxId}").
const basename = (window as unknown as { __CRUX_BASENAME__?: string }).__CRUX_BASENAME__ || '/';

const router = createBrowserRouter([
  // Public

  { path: '/', element: <Landing /> },
  { path: '/login', element: <Login /> },
  {
    path: '/discover',
    element: (
      <ErrorBoundary>
        <Discover />
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
        <PublicAuthor />
      </ErrorBoundary>
    ),
  },

  // App routes — auth optional (local-first: works without account)
  {
    element: <AppShell />,
    children: [
      {
        path: '/home',
        element: (
          <ErrorBoundary>
            <Garden />
          </ErrorBoundary>
        ),
      },
      {
        path: '/c/:id',
        element: (
          <ErrorBoundary>
            <CruxPage />
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
      <Suspense fallback={null}>
        <RouterProvider router={router} />
      </Suspense>
    </ErrorBoundary>
  );
}
