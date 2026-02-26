import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { Panel, Toggle } from '@/components/ui';

export default function Settings() {
  const { account, author } = useAuthStore();
  const { resolved, setMode } = useThemeStore();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-text mb-8">Settings</h1>

      {/* Account */}
      <Panel padding="md" className="mb-6">
        <h2 className="font-display text-sm font-medium text-accent mb-4">Account</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Email</span>
            <span className="text-text">{account?.email ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Username</span>
            <span className="text-text">@{author?.username ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Role</span>
            <span className="text-text">{account?.role ?? '—'}</span>
          </div>
        </div>
      </Panel>

      {/* Appearance */}
      <Panel padding="md" className="mb-6">
        <h2 className="font-display text-sm font-medium text-accent mb-4">Appearance</h2>
        <Toggle
          checked={resolved === 'light'}
          onChange={(light) => setMode(light ? 'light' : 'dark')}
          label="Light mode"
        />
      </Panel>

      {/* Subscription — placeholder for Phase 5 */}
      <Panel padding="md">
        <h2 className="font-display text-sm font-medium text-accent mb-4">Subscription</h2>
        <p className="text-sm text-text-muted">Free tier — public gardens, bring your own API keys</p>
      </Panel>
    </div>
  );
}
