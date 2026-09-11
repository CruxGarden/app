import {usePublishing} from './use-publishing';
import {isElectronRenderer} from '../util/is-electron';
import {TwineElectronWindow} from '../electron/shared';

export interface UseStoryLaunchProps {
	playStory: (storyId: string) => Promise<void>;
	proofStory: (storyId: string) => Promise<void>;
	testStory: (storyId: string, startPassageId?: string) => Promise<void>;
}

/**
 * Provides functions to launch a story that include the correct handling for
 * both web and Electron contexts.
 */
export function useStoryLaunch(): UseStoryLaunchProps {
	const {proofStory, publishStory} = usePublishing();

	if (isElectronRenderer()) {
		const {twineElectron} = window as TwineElectronWindow;

		if (!twineElectron) {
			throw new Error('Electron bridge is not present on window.');
		}

		// These are async to match the type in the browser context.

		return {
			playStory: async storyId => {
				twineElectron.openWithScratchFile(
					await publishStory(storyId),
					`play-${storyId}.html`
				);
			},
			proofStory: async storyId => {
				twineElectron.openWithScratchFile(
					await proofStory(storyId),
					`proof-${storyId}.html`
				);
			},
			testStory: async (storyId, startPassageId) => {
				twineElectron.openWithScratchFile(
					await publishStory(storyId, {
						formatOptions: 'debug',
						startId: startPassageId
					}),
					`test-${storyId}.html`
				);
			}
		};
	}

	return {
		playStory: async storyId => showPreview(await publishStory(storyId)),
		proofStory: async storyId => showPreview(await proofStory(storyId)),
		testStory: async (storyId, startPassageId) =>
			showPreview(
				await publishStory(storyId, {
					formatOptions: 'debug',
					startId: startPassageId
				})
			)
	};
}
function showPreview(html: string) {
	const overlay = document.createElement('div');
	overlay.id = 'garden-story-preview';
	overlay.style.cssText =
		'position:fixed;inset:0 0 34px;z-index:9000;background:white;display:flex;flex-direction:column';
	const close = document.createElement('button');
	close.textContent = 'Return to story editor';
	close.onclick = () => overlay.remove();
	close.style.cssText =
		'padding:10px;background:#24282c;color:white;border:0;cursor:pointer';
	const frame = document.createElement('iframe');
	frame.title = 'Play story';
	frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-downloads');
	frame.style.cssText = 'border:0;flex:1;width:100%';
	frame.srcdoc = html;
	overlay.append(close, frame);
	document.body.append(overlay);
}
