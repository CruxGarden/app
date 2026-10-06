import { LOCAL_MODEL_CHOICES, type LocalModelChoice } from './local-model-fit';
import { create } from 'zustand';
import { setDefaultModel } from '@/ai/keys';
import { detectLocalEndpoints } from '@/ai/local';
import { toast } from '@/stores/toastStore';
import { PullError, createRateMeter, pullOllamaModel, type PullProgress } from './ollama-pull';
import { useSetupWizard } from './setup-store';

/**
 * The recommended model's download, kept outside any screen: it carries on
 * while the person moves through the wizard (or leaves it), and says when it
 * is done. One download at a time.
 */
interface LocalDownload {
  pulling: boolean;
  model: LocalModelChoice | null;
  progress: PullProgress | null;
  secondsLeft: number | null;
  error: string;
  /** Ollama's model list changed: detection should look again. */
  revision: number;
}

export const useLocalDownload = create<LocalDownload>(() => ({
  pulling: false,
  model: null,
  progress: null,
  secondsLeft: null,
  error: '',
  revision: 0,
}));

let controller: AbortController | null = null;

export async function startRecommendedDownload(
  model: LocalModelChoice = LOCAL_MODEL_CHOICES[2]!,
): Promise<void> {
  if (controller) return;
  controller = new AbortController();
  const meter = createRateMeter();
  useLocalDownload.setState({ model, pulling: true, progress: null, secondsLeft: null, error: '' });
  try {
    await pullOllamaModel(model.name, {
      signal: controller.signal,
      onProgress: (progress) => {
        meter.sample(progress.completed, Date.now());
        useLocalDownload.setState({
          progress,
          secondsLeft: meter.secondsLeft(Math.max(0, progress.total - progress.completed)),
        });
      },
    });
    await detectLocalEndpoints(true);
    await setDefaultModel(`ollama/${model.name}`);
    if (useSetupWizard.getState().active) useSetupWizard.getState().set({ aiUsed: true });
    toast(`${model.label} is downloaded and ready to help in your new Cruxes.`);
  } catch (err) {
    useLocalDownload.setState({
      error: err instanceof PullError ? err.message : 'The download stopped. Try again.',
    });
  } finally {
    controller = null;
    useLocalDownload.setState((s) => ({ pulling: false, revision: s.revision + 1 }));
  }
}

export function cancelRecommendedDownload(): void {
  controller?.abort();
}
