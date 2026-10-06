import { lazy, Suspense } from 'react';
import { Modal } from '@/components/ui';
import { useShellDialogs, type ShellDialog } from '@/stores/shellDialogs';
import ShortcutsList from './ShortcutsList';
import ReportProblem from './ReportProblem';

const AboutContent = lazy(() => import('@/components/settings/AboutContent'));
const OpenSourceNotices = lazy(() => import('@/components/settings/OpenSourceNotices'));

const TITLES: Record<ShellDialog, { title: string; size: 'md' | 'lg' }> = {
  shortcuts: { title: 'Keyboard shortcuts', size: 'md' },
  'report-problem': { title: 'Report a problem', size: 'md' },
  about: { title: 'About Crux Garden', size: 'md' },
  notices: { title: 'Open-source notices', size: 'lg' },
};

/** The shell's own dialogs: one at a time, opened from the menu, ⌘K or Settings. */
export default function ShellDialogs() {
  const open = useShellDialogs((s) => s.open);
  const close = useShellDialogs((s) => s.close);
  return (
    <>
      {(Object.keys(TITLES) as ShellDialog[]).map((name) => (
        <Modal
          key={name}
          open={open === name}
          onClose={close}
          title={TITLES[name].title}
          size={TITLES[name].size}
          className="max-h-[calc(100vh-6rem)]"
        >
          <Suspense fallback={null}>
            {name === 'shortcuts' && <ShortcutsList />}
            {name === 'report-problem' && <ReportProblem />}
            {name === 'about' && <AboutContent />}
            {name === 'notices' && <OpenSourceNotices />}
          </Suspense>
        </Modal>
      ))}
    </>
  );
}
