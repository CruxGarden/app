import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthGuard from '@/components/auth/AuthGuard';
import AppShell from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/ui';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Garden from '@/pages/Garden';
import CruxPage from '@/pages/Crux';
import Settings from '@/pages/Settings';
import NotFound from '@/pages/NotFound';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />

          {/* Protected */}
          <Route element={<AuthGuard />}>
            <Route element={<AppShell />}>
              <Route path="/garden" element={<ErrorBoundary><Garden /></ErrorBoundary>} />
              <Route path="/crux/:id" element={<ErrorBoundary><CruxPage /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
