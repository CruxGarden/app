import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AuthGuard from '@/components/auth/AuthGuard';
import AppShell from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/ui';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Garden from '@/pages/Garden';
import CruxPage from '@/pages/Crux';
import Settings from '@/pages/Settings';
import PublicCrux from '@/pages/PublicCrux';
import PublicAuthor from '@/pages/PublicAuthor';
import NotFound from '@/pages/NotFound';

const router = createBrowserRouter([
  // Public
  { path: '/', element: <Landing /> },
  { path: '/login', element: <Login /> },
  { path: '/:username/:slug', element: <ErrorBoundary><PublicCrux /></ErrorBoundary> },
  { path: '/:username', element: <ErrorBoundary><PublicAuthor /></ErrorBoundary> },

  // Protected
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/garden', element: <ErrorBoundary><Garden /></ErrorBoundary> },
          { path: '/crux/:id', element: <ErrorBoundary><CruxPage /></ErrorBoundary> },
          { path: '/settings', element: <ErrorBoundary><Settings /></ErrorBoundary> },
        ],
      },
    ],
  },

  // Catch-all
  { path: '*', element: <NotFound /> },
]);

export default function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
