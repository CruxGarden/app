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
]);

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <RouterProvider router={router} />
      </Suspense>
    </ErrorBoundary>
  );
}
