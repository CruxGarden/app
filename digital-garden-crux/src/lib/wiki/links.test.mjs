import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { indexGarden, splitFrontmatter, resolveTarget, basenameMap } from "./links.mjs";

function garden() {
  const root = mkdtempSync(join(tmpdir(), "garden-links-"));
  mkdirSync(join(root, "notes"), { recursive: true });
  mkdirSync(join(root, "essays"), { recursive: true });
  writeFileSync(
    join(root, "index.md"),
    '---\ntitle: "Welcome"\ngrowthStage: "evergreen"\ntags: ["hub", "index"]\n---\nStart with [[What is a digital garden]] and [[tending-notes|how I tend]]. See also [the essay](/wiki/essays/learning-in-public).\n',
  );
  writeFileSync(
    join(root, "notes/what-is-a-digital-garden.md"),
    "---\ntitle: What is a digital garden\ngrowthStage: budding\n---\nA garden, not a stream. Back to [[index]]. Ignore `[[not a link]]` and\n```\n[[also not]]\n```\nUnknown [[nowhere]] resolves to nothing; a heading link [[tending-notes#daily]] counts once.\n",
  );
  writeFileSync(join(root, "notes/tending-notes.md"), "---\ntitle: Tending notes\n---\nSelf link [[tending-notes]] is dropped.\n");
  writeFileSync(join(root, "essays/learning-in-public.md"), "---\ntitle: Learning in public\n---\nNo links here.\n");
  return root;
}

test("splitFrontmatter reads strings and lists", () => {
  const { data, body } = splitFrontmatter('---\ntitle: "A"\ntags: ["x", y]\n---\nbody');
  assert.equal(data.title, "A");
  assert.deepEqual(data.tags, ["x", "y"]);
  assert.equal(body, "body");
  assert.deepEqual(splitFrontmatter("plain").data, {});
});

test("the index resolves wikilinks, aliases, headings and /wiki links; skips code, self links and unknowns", () => {
  const root = garden();
  try {
    const index = indexGarden(root);
    assert.deepEqual(
      index.nodes.map((n) => n.id),
      ["essays/learning-in-public", "index", "notes/tending-notes", "notes/what-is-a-digital-garden"],
    );
    assert.deepEqual(index.outgoing.get("index"), [
      "notes/what-is-a-digital-garden",
      "notes/tending-notes",
      "essays/learning-in-public",
    ]);
    assert.deepEqual(index.outgoing.get("notes/what-is-a-digital-garden"), ["index", "notes/tending-notes"]);
    assert.deepEqual(index.outgoing.get("notes/tending-notes"), []);
    assert.deepEqual(index.incoming.get("notes/tending-notes"), ["index", "notes/what-is-a-digital-garden"]);
    assert.equal(index.edges.length, 5);
    const hub = index.nodes.find((n) => n.id === "index");
    assert.equal(hub.growthStage, "evergreen");
    assert.deepEqual(hub.tags, ["hub", "index"]);
    assert.equal(hub.links, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveTarget leaves external links, anchors and absolute paths alone", () => {
  const notes = [{ id: "notes/a-b" }, { id: "index" }];
  const byName = basenameMap(notes);
  const ids = new Set(notes.map((n) => n.id));
  assert.equal(resolveTarget("https://example.com", byName, ids), null);
  assert.equal(resolveTarget("#top", byName, ids), null);
  assert.equal(resolveTarget("/about", byName, ids), null);
  assert.equal(resolveTarget("A B", byName, ids), "notes/a-b");
  assert.equal(resolveTarget("/wiki/notes/a-b/", byName, ids), "notes/a-b");
  assert.equal(resolveTarget("/wiki", byName, ids), "index");
  assert.equal(resolveTarget("/wiki/a-b#x", byName, ids), "notes/a-b");
});
