import fractalGarden from '@/assets/moods/digital-fractal-garden/garden.webp?url';
import MoodBar from '@/components/mood/MoodBar';
import { Panel, IconButton } from '@/components/ui';
import { PlusCircleIcon } from '@/components/ui/icons';
import { APP_NAME } from '@/lib/constants';

/**
 * The crux.garden hero — the Gateway's look, as Daniel's screenshot has it
 * (ADR 0043, LIQUID-GLASS-MOODS-PLAN.md §6): the Default Mood's render full
 * bleed, the frosted wordmark card with "grow anything", one round button,
 * and the player below. The render is painted here (the site's route has no
 * Mood background layer); the frost comes from the worn Mood's liquid glass.
 */
export default function GardenHero() {
  return (
    <section
      className="grow-hero"
      data-testid="garden-hero"
      style={{ backgroundImage: `url("${fractalGarden}")` }}
    >
      <div className="grow-hero-dim" aria-hidden="true" />
      <Panel padding="lg" className="grow-hero-card w-fit flex flex-col items-center px-8 py-6">
        <h1 className="font-wordmark text-5xl font-semibold text-gateway-title">{APP_NAME}</h1>
        <p className="text-gateway-subtitle text-lg mt-1">grow anything</p>
        <div className="mt-6">
          <IconButton
            label="Get Crux Garden"
            size="lg"
            onClick={() =>
              document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })
            }
            className="!w-14 !h-14 bg-gateway-button !text-gateway-button-text hover:bg-gateway-button-hover hover:!text-gateway-button-text"
          >
            <PlusCircleIcon size={40} />
          </IconButton>
        </div>
      </Panel>
      <div className="grow-hero-player">
        <MoodBar gateway />
      </div>
    </section>
  );
}
