// @ts-check
import { unified } from "@astrojs/markdown-remark";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "url";
import path from "path";
import pagefind from "astro-pagefind";
import { SITE } from "./src/lib/site-config";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import wikiLink from "remark-wiki-link";
import { wikiLinkOptions } from "./src/lib/wiki/wiki-link-resolver.mjs";
import { remarkCustomSyntax } from "./src/lib/wiki/remark-custom-syntax.mjs";
import { remarkAlert } from "remark-github-blockquote-alert";
import { remarkDefinitionList } from "remark-definition-list";
import mdx from "@astrojs/mdx";



const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // The public address once shared (src/config.json → url); unset until then.
  site: SITE.url || undefined,
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  },
  integrations: [pagefind(), mdx()],
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkMath,
        [wikiLink, { ...wikiLinkOptions, aliasDivider: "|" }],
        remarkDefinitionList,
        remarkCustomSyntax,
        remarkAlert,
      ],
      rehypePlugins: [rehypeKatex],
    }),
    shikiConfig: {
      themes: {
        dark: "github-dark",
        light: "github-light",
      },
    },
  },
});
