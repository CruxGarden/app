import rss from "@astrojs/rss";
import { getAllPosts } from "@/data/post";
import { siteConfig } from "@/site.config";

export const GET = async () => {
	const posts = await getAllPosts();

	return rss({
		title: siteConfig.title,
		description: siteConfig.description,
		// Crux Garden: a feed needs absolute links; until the public address is set (src/config.json → url) a stand-in keeps the build going.
		site: import.meta.env.SITE || "https://set-the-public-address.invalid/",
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.publishDate,
			link: `posts/${post.id}/`,
		})),
	});
};
