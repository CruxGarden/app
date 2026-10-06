import { useEffect } from 'react';
import SynthControls from '@/components/mood/SynthControls';
import { useAudioStore } from '@/stores/audioStore';

/** Closing a control surface does not stop the garden-wide instrument. */
export default function SynthPane() {
  const init = useAudioStore((s) => s.init);
  useEffect(() => init(), [init]);
  return (
    <div className="h-full min-h-0 min-w-0 overflow-y-auto p-3">
      <SynthControls />
    </div>
  );
}
