import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import MeshBackground from '@/components/layout/MeshBackground';
import CruxBloom from '@/components/brand/CruxBloom';
import { Button, IconButton } from '@/components/ui';

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function Landing() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { resolved, setMode } = useThemeStore();

  return (
    <div className="relative min-h-screen flex flex-col">
      <MeshBackground />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 h-16">
        <div className="flex items-center gap-2">
          <CruxBloom size={28} />
          <span className="font-display font-medium text-text">crux.garden</span>
        </div>
        <div className="flex items-center gap-3">
          <IconButton
            label="Toggle theme"
            size="sm"
            onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}
          >
            {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
          </IconButton>
          {isAuthenticated ? (
            <Link to="/garden">
              <Button size="sm">Open Garden</Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button size="sm">Sign In</Button>
            </Link>
          )}
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-8">
          <CruxBloom size={120} />
        </div>

        <h1 className="font-display text-4xl md:text-5xl font-bold text-text mb-4 max-w-2xl leading-tight">
          Where ideas grow
        </h1>

        <p className="text-lg text-text-muted max-w-xl mb-8 font-body leading-relaxed">
          A creative workspace that captures the evolution of your ideas.
          Collaborate with AI, and build a navigable history of every
          decision, every alternative, every breakthrough.
        </p>

        <div className="flex items-center gap-4">
          <Link to={isAuthenticated ? '/garden' : '/login'}>
            <Button size="lg">Get Started</Button>
          </Link>
        </div>

        {/* Feature highlights */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl w-full">
          <FeatureCard
            title="Automatic Versioning"
            description="Every decision captured as a structured snapshot. No manual tagging required."
          />
          <FeatureCard
            title="AI Collaboration"
            description="Work with AI models through a conversational interface. The thinking persists."
          />
          <FeatureCard
            title="Connected Gardens"
            description="Ideas reference and build on each other across projects, across time."
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-xs text-text-muted">
        crux.garden
      </footer>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-panel backdrop-blur-[var(--panel-blur)] border border-border rounded-[var(--radius)] p-5 text-left">
      <h3 className="font-display text-sm font-medium text-accent mb-2">{title}</h3>
      <p className="text-sm text-text-muted leading-relaxed">{description}</p>
    </div>
  );
}
