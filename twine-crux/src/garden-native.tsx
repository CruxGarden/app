import * as React from 'react';
import {useStoriesContext, updateStory, updatePassage} from './store/stories';
declare global {
	interface Window {
		gardenTwine: {
			garden: any;
			pending: Set<symbol>;
			captureStorage: () => Record<string, string>;
		};
	}
}
export const GardenNative: React.FC = () => {
	const state = useStoriesContext();
	const current = React.useRef(state);
	current.current = state;
	React.useEffect(() => {
		const {garden, captureStorage} = window.gardenTwine;
		garden.connect({
			busy: () => window.gardenTwine.pending.size > 0,
			capture: captureStorage,
			async command(command: {
				op: string;
				storyId?: string;
				title?: string;
				passageId?: string;
				text?: string;
			}) {
				const {stories, dispatch} = current.current;
				if (command.op === 'inspect')
					return {
						stories: stories.map(s => ({
							id: s.id,
							title: s.name,
							passages: s.passages.length,
							passageDetails: s.passages
								.slice(0, 100)
								.map(p => ({
									id: p.id,
									name: p.name,
									text: p.text.slice(0, 2000),
									truncated: p.text.length > 2000
								})),
							passagesTruncated: s.passages.length > 100,
							format: s.storyFormat
						}))
					};
				if (command.op === 'set-passage') {
					const story = stories.find(s => s.id === command.storyId);
					const passage = story?.passages.find(p => p.id === command.passageId);
					if (!story || !passage)
						throw new Error(
							'Choose a passage belonging to the specified story from inspect_twine.'
						);
					if (typeof command.text !== 'string' || command.text.length > 100000)
						throw new Error('Choose passage text up to 100,000 characters.');
					dispatch(updatePassage(story, passage, {text: command.text}));
					await new Promise(resolve => requestAnimationFrame(resolve));
					return {storyId: story.id, passageId: passage.id};
				}

				if (
					command.op !== 'set-title' ||
					!command.title?.trim() ||
					command.title.length > 300
				)
					throw new Error('Choose a story title up to 300 characters.');
				const story = stories.find(s => s.id === command.storyId);
				if (!story)
					throw new Error('Choose an existing story ID from inspect_twine.');
				dispatch(updateStory(stories, story, {name: command.title}));
				await new Promise(resolve => requestAnimationFrame(resolve));
				return {storyId: story.id, title: command.title};
			}
		});
	}, []);
	return null;
};
