import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import { siteConfig } from "@/site.config";

export const GET = async () => {
	const notes = await getCollection("note");

	return rss({
		title: siteConfig.title,
		description: siteConfig.description,
		// Crux Garden: a feed needs absolute links; until the public address is set (src/config.json → url) a stand-in keeps the build going.
		site: import.meta.env.SITE || "https://set-the-public-address.invalid/",
		items: notes.map((note) => ({
			title: note.data.title,
			pubDate: note.data.publishDate,
			link: `notes/${note.id}/`,
		})),
	});
};
