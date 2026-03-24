import AccountSettings from '@/components/settings/AccountSettings';
import SyncSettings from '@/components/settings/SyncSettings';
import DataSettings from '@/components/settings/DataSettings';
import AiSettings from '@/components/settings/AiSettings';

export default function Settings() {
  return (
    <div className="overflow-y-auto flex-1 py-2">

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
