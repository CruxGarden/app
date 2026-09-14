// The garden as data: nodes (notes) and edges (links) for the graph page and anyone else.
import type { APIRoute } from "astro";
import { gardenIndex, hrefFor } from "@/lib/wiki/garden-index";

export const GET: APIRoute = () => {
  const index = gardenIndex();
  return new Response(
    JSON.stringify({
      nodes: index.nodes.map((n) => ({ ...n, href: hrefFor(n.id) })),
      links: index.edges,
    }),
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
};
