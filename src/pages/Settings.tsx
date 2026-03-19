import AccountSettings from '@/components/settings/AccountSettings';
import SyncSettings from '@/components/settings/SyncSettings';
import DataSettings from '@/components/settings/DataSettings';
import AiSettings from '@/components/settings/AiSettings';

export default function Settings() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-bold text-text mb-8">Settings</h1>

      <AccountSettings />

      <div className="mt-6">
        <AiSettings />
      </div>

      <div className="mt-6">
        <SyncSettings />
      </div>

      <div className="mt-6">
        <DataSettings />
      </div>
    </div>
  );
}
