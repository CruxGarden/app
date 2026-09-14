// The garden's settings live in src/config.json so the Builder's settings form
// (and a person in any editor) can change them without touching code.
import config from "../config.json";

export const SITE = {
  name: config.title || "My Digital Garden",
  title: config.title || "My Digital Garden",
  description: config.description || "A living collection of notes.",
  author: config.author || "",
  url: config.url || "",
  image: "/og-image.png",
  favicon: "/favicon.svg",
};
