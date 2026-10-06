import { useEffect, useRef, useState } from 'react';
import { ApiKeySetup, Button, segmentClass, segmentGroupClass } from '@/components/ui';
import ConnectAccount from '@/components/auth/ConnectAccount';
import IncludedStatus from '@/components/chat/IncludedStatus';
import { PROVIDERS, isAgentModel } from '@/ai/providers';
import { isLocalModel, localModelName } from '@/ai/local';
import { SettingsKey } from '@/lib/constants';
import { Capability, can } from '@/lib/platform';
import { WEBSITE_URL } from '@/lib/site';
import { useSetting } from '@/hooks/useSetting';
import { openWeb } from '@/services/desktop';
import { useIncludedAccess } from '@/services/included-access';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import SetupSection from './SetupSection';
import { useSetupWizard } from './setup-store';
import { Disclosure, Recommended } from './setup-ui';
import { KEY_PROVIDERS, type SavedKeys } from './useSavedKeys';

const IMAGE_PROVIDERS = KEY_PROVIDERS.filter((id) =>
  PROVIDERS[id]?.capabilities.includes('Images'),
);

function useIncludedReady() {
  const { status, usage } = useIncludedAccess();
  const ready = status === 'ready' && !!usage?.eligible && usage.available;
  return { ready, status, usage };
}

interface SectionProps {
  open: boolean;
  onOpen: () => void;
  onLater: () => void;
  saved: SavedKeys;
}

type Route = 'key' | 'local';

/** A collaborator in your Crux: included with a plan (recommended), your own key, or this computer. */
export function CollaboratorSection({ open, onOpen, onLater, saved }: SectionProps) {
  const advancedMode = useSetupWizard((s) => s.advancedMode);
  const set = useSetupWizard((s) => s.set);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const included = useIncludedReady();
  const defaultModel = useSetting(SettingsKey.DefaultModel);
  const keyed = KEY_PROVIDERS.find((id) => saved.keys[id]);
  const [route, setRoute] = useState<Route>('key');
  const [otherOpen, setOtherOpen] = useState(false);
  // IncludedStatus's Settings links lead to the matching place here instead.
  const onSettingsLink = (section: 'ai' | 'usage') => {
    if (section === 'ai') {
      setRoute('key');
      setOtherOpen(true);
    } else void openWeb(`${WEBSITE_URL}/plans`);
  };
  const local = advancedMode && can(Capability.LocalInference);

  // Signing in to a plan that includes collaboration is setting it up.
  const wasReady = useRef(included.ready);
  useEffect(() => {
    if (included.ready) set({ aiUsed: true });
    if (included.ready && !wasReady.current)
      toast('Your plan includes a collaborator. You’re all set.');
    wasReady.current = included.ready;
  }, [included.ready, set]);

  const checking = !saved.loaded || (isAuthenticated && included.status === 'checking');
  const status = checking
    ? 'Looking…'
    : included.ready
      ? 'Included with your plan'
      : defaultModel && isLocalModel(defaultModel)
        ? `On this computer · ${localModelName(defaultModel)}`
        : defaultModel && isAgentModel(defaultModel)
          ? `${PROVIDERS[defaultModel]?.name ?? defaultModel} with your own sign-in`
          : keyed
            ? `Ready with your ${PROVIDERS[keyed]!.name} key`
            : 'Not set up yet';
  const ready = !checking && status !== 'Not set up yet';

  return (
    <SetupSection
      id="collaborator"
      title="A collaborator in your Crux"
      status={status}
      ready={ready}
      checking={checking}
      open={open}
      onOpen={onOpen}
      onLater={onLater}
    >
      <p className="text-xs text-text-muted">
        An AI assistant you can talk to, ask for ideas, and invite to make changes to your project.
      </p>
      <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text">Included with a crux.garden plan</span>
          <Recommended />
        </div>
        {isAuthenticated ? (
          <>
            <IncludedStatus onSettingsLink={onSettingsLink} />
          </>
        ) : (
          <ConnectAccount
            compact
            description="Sign in with your email. Nothing to install and no key to manage."
          />
        )}
      </div>
      <Disclosure
        label="Other ways"
        hint={local ? 'your own key, or this computer' : 'your own key'}
        open={otherOpen}
        onToggle={setOtherOpen}
        testId="setup-collaborator-other"
      >
        {local && (
          <div
            role="radiogroup"
            aria-label="Other ways to connect a collaborator"
            className={segmentGroupClass('self-start')}
          >
            {(
              [
                { id: 'key', label: 'Your own key' },
                { id: 'local', label: 'On this computer' },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={route === r.id}
                className={segmentClass(route === r.id)}
                onClick={() => setRoute(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        {(route === 'key' || !local) && (
          <>
            <p className="text-xs text-text-muted">
              {can(Capability.SecureSecrets)
                ? 'Have a key from Anthropic, OpenAI or Google? Paste it here. It stays on this computer, locked in your system’s secure storage.'
                : 'Have a key from Anthropic, OpenAI or Google? Paste it here.'}
            </p>
            <ApiKeySetup
              compact
              providers={KEY_PROVIDERS}
              onKeySaved={() => {
                set({ aiUsed: true });
                toast('Key saved. Your collaborator is ready.');
              }}
              onKeyChange={saved.refresh}
            />
          </>
        )}
        {route === 'local' && local && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-text-muted">
              Free and private: a model runs on your own computer with Ollama or LM Studio.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => set({ moreOpen: true, openSection: 'local' })}
            >
              Set up a model on this computer
            </Button>
          </div>
        )}
      </Disclosure>
    </SetupSection>
  );
}

/** Images: included with a plan, an OpenAI or Google key, or none. */
export function ImagesSection({ open, onOpen, onLater, saved }: SectionProps) {
  const set = useSetupWizard((s) => s.set);
  const included = useIncludedReady();
  const imageKey = IMAGE_PROVIDERS.find((id) => saved.keys[id]);
  const includedImages = included.ready && included.usage?.imagesAvailable !== false;
  const checking = !saved.loaded;
  const status = checking
    ? 'Looking…'
    : includedImages
      ? 'Included with your plan'
      : imageKey
        ? `Ready with your ${PROVIDERS[imageKey]!.name} key`
        : 'None yet · you can always use your own pictures';
  return (
    <SetupSection
      id="images"
      title="Pictures from a description"
      status={status}
      ready={!checking && (includedImages || !!imageKey)}
      checking={checking}
      open={open}
      onOpen={onOpen}
      onLater={onLater}
    >
      <p className="text-xs text-text-muted">
        Describe a picture and get one made. A crux.garden plan includes this (sign in under
        &ldquo;A collaborator in your Crux&rdquo;). Skipping is fine: you can always add your own
        pictures.
      </p>
      {included.ready && included.usage?.imagesAvailable === false && (
        <p className="text-xs text-text-muted">
          Image generation is temporarily unavailable. You can still use your own images.
        </p>
      )}
      <Disclosure label="Use your own OpenAI or Google key" testId="setup-images-keys">
        <ApiKeySetup
          compact
          providers={IMAGE_PROVIDERS}
          onKeySaved={() => {
            set({ aiUsed: true });
            toast('Key saved. Pictures are ready to make.');
          }}
          onKeyChange={saved.refresh}
        />
      </Disclosure>
    </SetupSection>
  );
}
