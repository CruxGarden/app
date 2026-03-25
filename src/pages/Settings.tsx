import AccountSettings from '@/components/settings/AccountSettings';
import SyncSettings from '@/components/settings/SyncSettings';
import DataSettings from '@/components/settings/DataSettings';
import AiSettings from '@/components/settings/AiSettings';

export default function Settings() {
  return (
    <div className="overflow-y-auto flex-1 flex flex-col gap-4">
      <AccountSettings />
      <AiSettings />
      <SyncSettings />
      <DataSettings />
    </div>
  );
}
