/** Offline artifact verification; does not launch or modify Crux Garden. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, "../../electron/package.json"));
const { chromium } = require("playwright");
const out = process.env.CRUX_STORY_QA_OUT || "/tmp/crux-story-guide-qa";
await mkdir(out, { recursive: true });
const html = await readFile(resolve(here, "v1-user-stories.html"), "utf8");
const data = JSON.parse(
  html.match(
    /<script id="guide-data" type="application\/json">([\s\S]*?)<\/script>/,
  )[1],
);
assert.equal(data.ledger.unmapped, 0);
assert.equal(data.ledger.baselineChecks, data.ledger.baselineMapped);
assert.equal(data.ledger.creationChoices, data.ledger.creationMapped);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
const external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (/^https?:/.test(r.url())) external.push(r.url());
});
const url = pathToFileURL(resolve(here, "v1-user-stories.html")).href;
const story = (id) => page.locator("#story-" + id);
const result = (id) =>
  page.getByRole("combobox", { name: "Result for " + id, exact: true });
const notes = (id) =>
  page.getByRole("textbox", { name: "Notes for " + id, exact: true });
try {
  await page.goto(url);
  await page.locator("#story-INSTALL").waitFor();
  assert.equal(
    await page.locator("article.story").count(),
    data.stories.length,
  );
  assert.match(await page.locator("#story-score").innerText(), /^0 \/ /);
  assert.match(
    await page.locator("#criteria-score").innerText(),
    new RegExp(data.ledger.criteria + " untested"),
  );
  assert.equal(
    await page.locator(".criterion").count(),
    0,
    "Detailed controls load only on demand",
  );
  await page.screenshot({ path: resolve(out, "desktop.png"), fullPage: false });
  await page.getByLabel("Session route").selectOption("start");
  assert.equal(
    await page.locator("article.story").count(),
    data.stories.filter((s) => s.route === "start").length,
  );
  await page.getByLabel("Session route").selectOption("core");
  assert.equal(
    await page.locator("article.story").count(),
    data.stories.filter((s) => s.core).length,
  );
  assert.equal(data.ledger.coreStories, data.stories.filter((s) => s.core).length);
  await page.getByLabel("Session route").selectOption("tools");
  assert.equal(
    await page.locator("article.story").count(),
    data.ledger.creationChoices,
  );
  await page.getByLabel("Session route").selectOption("all");
  await page
    .getByLabel("Find a story, control or criterion")
    .fill("I can automate from a terminal");
  assert.equal(await page.locator("article.story").count(), 1);
  await page.locator("#meta-run").fill("Manual guide QA");
  await page.locator("#meta-build").fill("test-only");
  await result("CLI").selectOption("fail");
  const hostile =
    '<img src=x onerror="window.badImport=true"> literal evidence, not HTML';
  await notes("CLI").fill(hostile);
  await page
    .getByLabel("Experience for CLI", { exact: true })
    .selectOption("friction");
  await story("CLI").locator("details[data-criteria] summary").click();
  await result("CLI-OUTCOME-1").selectOption("blocked");
  await notes("CLI-OUTCOME-1").fill("Missing test account.");
  await page.reload();
  assert.equal(await result("CLI").inputValue(), "fail");
  assert.equal(await notes("CLI").inputValue(), hostile);
  assert.equal(await page.locator("#meta-build").inputValue(), "test-only");
  assert.match(
    await page.locator("#saved").innerText(),
    /Loaded saved results/,
  );
  assert.equal(await page.locator("img").count(), 0);
  await page.getByLabel("Results to show").selectOption("blocked");
  assert.equal(
    await page.locator("article.story").count(),
    1,
    "Child status must affect filtering",
  );
  assert.equal(await story("CLI").count(), 1);
  await page.locator("#gaps summary").click();
  await page.locator("#gap-title").fill("Unlisted native command");
  await page
    .locator("#gap-note")
    .fill("Record its exact expected output before signoff.");
  await page
    .getByRole("button", { name: "Record coverage gap", exact: true })
    .click();
  assert.match(
    await page.locator("#results-score").innerText(),
    /1 open coverage gaps/,
  );
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export results · JSON", exact: true })
    .click();
  const exportPath = resolve(out, "results.json");
  await (await downloaded).saveAs(exportPath);
  const exported = JSON.parse(await readFile(exportPath, "utf8"));
  assert.equal(exported.records["story:CLI"].notes, hostile);
  assert.equal(exported.records["check:CLI-OUTCOME-1"].status, "blocked");
  assert.equal(exported.gaps.length, 1);
  const reportEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export readable report", exact: true })
    .click();
  const reportPath = resolve(out, "report.md");
  await (await reportEvent).saveAs(reportPath);
  const report = await readFile(reportPath, "utf8");
  for (const s of data.stories)
    for (const c of s.checks)
      assert.ok(report.includes(c.id), "Report omitted " + c.id);
  // Refuse malformed and foreign results atomically, retaining current notes.
  await page.locator("#import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await page.waitForFunction(() =>
    document
      .getElementById("message")
      .textContent.startsWith("Import refused:"),
  );
  assert.equal(await notes("CLI").inputValue(), hostile);
  const foreign = structuredClone(exported);
  foreign.records["check:does-not-exist"] = { status: "pass", notes: "" };
  await page.locator("#import-file").setInputFiles({
    name: "foreign.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(foreign)),
  });
  await page.waitForFunction(() =>
    document
      .getElementById("message")
      .textContent.includes("another guide edition"),
  );
  assert.equal(await notes("CLI").inputValue(), hostile);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Start a new run", exact: true })
    .click();
  await page.getByLabel("Results to show").selectOption("all");
  assert.equal(await result("CLI").inputValue(), "untested");
  page.once("dialog", (d) => d.accept());
  await page.locator("#import-file").setInputFiles(exportPath);
  await page.waitForFunction(
    () =>
      document.getElementById("message").textContent === "Results imported.",
  );
  assert.equal(await result("CLI").inputValue(), "fail");
  assert.equal(await notes("CLI").inputValue(), hostile);
  assert.equal(await page.evaluate(() => window.badImport), undefined);
  // Keyboard interaction, small viewport, high zoom and offline usability.
  await page
    .getByLabel("Find a story, control or criterion")
    .fill("I make my first home page without AI");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    () => (document.documentElement.style.scrollBehavior = "auto"),
  );
  await story("HELLO").locator("h3").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, "phone.png"), fullPage: false });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Phone horizontal overflow",
  );
  await page.locator("#story-HELLO details[data-criteria] summary").focus();
  await page.keyboard.press("Enter");
  assert.ok(
    await story("HELLO")
      .locator("details[data-criteria]")
      .evaluate((e) => e.open),
  );
  await context.setOffline(true);
  await page.reload();
  await page
    .getByLabel("Find a story, control or criterion")
    .fill("I make my first home page without AI");
  assert.equal(await story("HELLO").count(), 1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (document.body.style.zoom = "2"));
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Zoom causes horizontal overflow",
  );
  await page.evaluate(() => (document.body.style.zoom = "1"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: resolve(out, "story.png"), fullPage: true });
  // Printing a filtered view includes its detailed criteria and recorded values.
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  assert.ok(
    await story("HELLO")
      .locator("details[data-criteria]")
      .evaluate((e) => e.open),
  );
  assert.equal(await page.locator("#gaps").evaluate((e) => e.open), true);
  await page.pdf({
    path: resolve(out, "sample-print.pdf"),
    format: "A4",
    printBackground: true,
    margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
  });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  // Two guide tabs must never silently overwrite one another's evidence.
  const concurrent = await context.newPage();
  await concurrent.goto(url);
  await concurrent.getByRole("textbox", { name: "Notes for INSTALL", exact: true }).fill("Evidence in the other tab");
  // A saved copy superseded elsewhere must stop claiming "Saved" immediately,
  // even before this tab receives another edit.
  await page.locator("#storage-warning").waitFor({ state: "visible", timeout: 3000 });
  assert.match(await page.locator("#saved").innerText(), /Export JSON/);
  await page.getByLabel("Find a story, control or criterion").fill("");
  await notes("INSTALL").fill("Keep this tab's separate notes too");
  assert.equal(await page.locator("#storage-warning").isVisible(), true);
  assert.match(await page.locator("#storage-warning").innerText(), /another tab/);
  await concurrent.reload();
  assert.equal(await concurrent.getByRole("textbox", { name: "Notes for INSTALL", exact: true }).inputValue(), "Evidence in the other tab");
  const conflictExport = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const conflictPath = resolve(out, "concurrent-tab.json");
  await (await conflictExport).saveAs(conflictPath);
  assert.equal(JSON.parse(await readFile(conflictPath, "utf8")).records["story:INSTALL"].notes, "Keep this tab's separate notes too");
  await concurrent.close();
  // A run with ordinary long evidence notes must accept its own >5 MB export.
  const largeContext = await browser.newContext({ acceptDownloads: true });
  const largePage = await largeContext.newPage();
  await largePage.goto(url);
  const large = structuredClone(exported);
  for (const c of data.stories.flatMap((s) => s.checks).slice(0, 110))
    large.records["check:" + c.id] = { status: "blocked", notes: "Evidence ".repeat(5500), feel: "" };
  assert.ok(Buffer.byteLength(JSON.stringify(large)) > 5_000_000);
  largePage.once("dialog", (d) => d.accept());
  await largePage.locator("#import-file").setInputFiles({ name: "large-run.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(large)) });
  await largePage.waitForFunction(() => document.getElementById("message").textContent === "Results imported.");
  const largeExport = largePage.waitForEvent("download");
  await largePage.locator("#export-json").click();
  const largePath = resolve(out, "large-run.json");
  await (await largeExport).saveAs(largePath);
  assert.deepEqual(JSON.parse(await readFile(largePath, "utf8")).records, large.records);
  large.meta.run = "x".repeat(3001);
  await largePage.locator("#import-file").setInputFiles({ name: "overlong.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(large)) });
  await largePage.waitForFunction(() => document.getElementById("message").textContent.includes("Invalid run metadata"));
  await largeContext.close();
  // A storage failure must keep in-memory data available for export.
  const blocked = await browser.newContext();
  const p = await blocked.newPage();
  await p.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota", "QuotaExceededError");
    };
  });
  await p.goto(url);
  await p
    .getByRole("textbox", { name: "Notes for INSTALL", exact: true })
    .fill("Retain this even when storage refuses.");
  assert.equal(await p.locator("#storage-warning").isVisible(), true);
  const d = p.waitForEvent("download");
  await p
    .getByRole("button", { name: "Export results · JSON", exact: true })
    .click();
  const fallback = resolve(out, "storage-fallback.json");
  await (await d).saveAs(fallback);
  assert.equal(
    JSON.parse(await readFile(fallback, "utf8")).records["story:INSTALL"].notes,
    "Retain this even when storage refuses.",
  );
  await blocked.close();
  // Expedition mechanics derive rewards from evidence; they never pass a test.
  const expeditionContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const expedition = await expeditionContext.newPage();
  expedition.on("pageerror", (e) => errors.push(e.message));
  await expedition.goto(url);
  assert.equal(await expedition.locator(".garden-plot").count(), 10);
  assert.equal(await expedition.locator(".stamp[data-earned=true]").count(), 0);
  await expedition.locator("#begin-expedition").click();
  assert.equal(await expedition.locator("article.story").count(), 1);
  assert.equal(await expedition.locator("#story-INSTALL").count(), 1);
  assert.equal(
    await expedition
      .locator("#mission-desk")
      .evaluate((e) => e.nextElementSibling.id),
    "stories",
  );
  await expedition
    .getByRole("combobox", { name: "Result for INSTALL", exact: true })
    .selectOption("fail");
  assert.equal(
    await expedition.locator(".stamp[data-earned=true]").count(),
    0,
    "Clicking a status is not evidence",
  );
  await expedition
    .getByRole("textbox", { name: "Notes for INSTALL", exact: true })
    .fill("QA only: installer refused; keep exact error for triage.");
  assert.equal(
    await expedition.locator(".stamp[data-earned=true]").count(),
    2,
    "A documented failure earns investigation stamps",
  );
  assert.match(await expedition.locator("#story-score").innerText(), /^0 \/ /);
  await expedition.locator("#next-mission").click();
  assert.equal(await expedition.locator("#story-FIRST").count(), 1);
  await expedition.locator("#surprise-mission").click();
  assert.equal(await expedition.locator("article.story").count(), 1);
  assert.equal(await expedition.locator("#story-FIRST").count(), 0);
  await expedition.locator(".garden-plot").nth(7).focus();
  await expedition.keyboard.press("Enter");
  assert.equal(await expedition.locator("#story-MOODS").count(), 1);
  await expedition.locator("#browse-missions").click();
  assert.equal(
    await expedition.locator("article.story").count(),
    data.stories.length,
  );
  assert.match(
    await expedition
      .getByRole("textbox", { name: "Notes for INSTALL", exact: true })
      .inputValue(),
    /installer refused/,
  );
  // Finish an investigation with blocked results: completion must not mean passing.
  await expedition
    .getByLabel("Find a story, control or criterion")
    .fill("I make my first home page without AI");
  await expedition.locator("#story-HELLO .focus-button").click();
  await expedition
    .getByRole("combobox", { name: "Result for HELLO", exact: true })
    .selectOption("blocked");
  await expedition
    .getByRole("textbox", { name: "Notes for HELLO", exact: true })
    .fill("QA only: missing test installation.");
  await expedition
    .locator("#story-HELLO details[data-criteria] summary")
    .click();
  for (const c of data.stories.find((s) => s.id === "HELLO").checks) {
    await expedition
      .getByRole("combobox", { name: "Result for " + c.id, exact: true })
      .selectOption("blocked");
    await expedition
      .getByRole("textbox", { name: "Notes for " + c.id, exact: true })
      .fill("QA only: test installation unavailable.");
  }
  assert.match(
    await expedition.locator(".stamp").nth(3).innerText(),
    /^✓ Deep explorer/,
  );
  assert.match(
    await expedition.locator("#expedition-progress").innerText(),
    /^4 \/ /,
  );
  assert.match(
    await expedition.locator("#criteria-score").innerText(),
    /^0 \/ /,
  );
  assert.equal(
    await expedition
      .locator(".stamp")
      .nth(3)
      .evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await expedition.locator("#mission-desk").scrollIntoViewIfNeeded();
  await expedition.screenshot({
    path: resolve(out, "expedition-mission.png"),
    animations: "disabled",
  });
  await expedition.reload();
  assert.match(
    await expedition.locator(".stamp").nth(3).innerText(),
    /^✓ Deep explorer/,
  );
  await expedition.locator(".garden-plot").nth(7).click();
  await expedition.getByLabel("Session route").selectOption("start");
  assert.equal(
    await expedition.locator("article.story").count(),
    data.stories.filter((s) => s.route === "start").length,
  );
  // Scores are derived, so re-editing/importing cannot duplicate rewards.
  assert.equal(await expedition.locator("#xp-score").innerText(), "35 XP");
  await expedition.locator("#begin-expedition").click();
  const selectedId = await expedition
    .locator("article.story")
    .getAttribute("id");
  await expedition.locator("#pause-campaign").click();
  await expedition.reload();
  await expedition.locator("#begin-expedition").click();
  assert.equal(
    await expedition.locator("article.story").getAttribute("id"),
    selectedId,
  );
  assert.equal(await expedition.locator("#xp-score").innerText(), "35 XP");
  const stageOne = data.stories.filter((s) => s.chapter.startsWith("1 "));
  const charted = {
    schema: 1,
    guideEdition: data.edition,
    meta: { run: "Campaign QA only" },
    records: {},
    gaps: [],
    campaign: { missionId: stageOne.at(-1).id },
    xp: 999999,
  };
  for (const mission of stageOne) {
    for (const id of [
      "story:" + mission.id,
      ...mission.checks.map((c) => "check:" + c.id),
    ]) {
      charted.records[id] = {
        status: "blocked",
        notes:
          "QA fixture only: prerequisite unavailable; follow up before release.",
        feel: "",
      };
    }
  }
  const stagePoints = stageOne.reduce(
    (n, s) => n + 5 * s.checks.length + 15,
    100,
  );
  async function importCampaign(value) {
    await expedition.evaluate(
      () => (document.getElementById("message").textContent = ""),
    );
    expedition.once("dialog", (d) => d.accept());
    await expedition.locator("#import-file").setInputFiles({
      name: "campaign.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
    await expedition.waitForFunction(
      () =>
        document.getElementById("message").textContent === "Results imported.",
    );
  }
  await importCampaign(charted);
  assert.equal(
    await expedition.locator("#xp-score").innerText(),
    stagePoints.toLocaleString() + " XP",
  );
  assert.equal(
    await expedition.locator("#stage-badge").getAttribute("data-earned"),
    "true",
  );
  assert.match(
    await expedition.locator("#next-stage").innerText(),
    /Continue to next stage/,
  );
  assert.match(await expedition.locator("#story-score").innerText(), /^0 \/ /);
  assert.match(
    await expedition.locator("#xp-level").innerText(),
    new RegExp("Level " + (1 + Math.floor(stagePoints / 250))),
  );
  await importCampaign(charted);
  assert.equal(
    await expedition.locator("#xp-score").innerText(),
    stagePoints.toLocaleString() + " XP",
    "Reimport must not farm stage rewards",
  );
  // Withdrawing one criterion withdraws its XP, mission bonus and stage bonus.
  const firstCheck = stageOne[0].checks[0];
  charted.records["check:" + firstCheck.id].status = "untested";
  await importCampaign(charted);
  assert.equal(
    await expedition.locator("#xp-score").innerText(),
    (stagePoints - 120).toLocaleString() + " XP",
  );
  assert.equal(
    await expedition.locator("#stage-badge").getAttribute("data-earned"),
    "false",
  );
  charted.records["check:" + firstCheck.id].status = "blocked";
  await importCampaign(charted);
  await expedition.locator("#next-stage").click();
  assert.match(
    await expedition.locator("#stage-number").innerText(),
    /^Stage 2 of 10/i,
  );
  await expedition.reload();
  assert.match(
    await expedition.locator("#begin-expedition").innerText(),
    /Resume stage 2/,
  );
  assert.equal(
    await expedition.locator("#xp-score").innerText(),
    stagePoints.toLocaleString() + " XP",
  );
  const checkpointDownload = expedition.waitForEvent("download");
  await expedition.locator("#export-json").click();
  const campaignPath = resolve(out, "campaign-results.json");
  await (await checkpointDownload).saveAs(campaignPath);
  const checkpoint = JSON.parse(await readFile(campaignPath, "utf8"));
  assert.equal(
    checkpoint.campaign.missionId,
    data.stories.find((s) => s.chapter.startsWith("2 ")).id,
  );
  assert.equal(
    checkpoint.xp,
    undefined,
    "Imported scores must not be trusted or stored",
  );
  // Older exports gain a safe checkpoint without losing their evidence.
  delete charted.campaign;
  await importCampaign(charted);
  assert.match(
    await expedition.locator("#begin-expedition").innerText(),
    /Resume stage 1/,
  );
  assert.equal(
    await expedition.locator("#xp-score").innerText(),
    stagePoints.toLocaleString() + " XP",
  );
  const invalid = { ...charted, campaign: { missionId: "NOT-A-MISSION" } };
  await expedition.locator("#import-file").setInputFiles({
    name: "invalid-campaign.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expedition.waitForFunction(() =>
    document
      .getElementById("message")
      .textContent.startsWith("Import refused:"),
  );
  assert.equal(
    await expedition.locator("#xp-score").innerText(),
    stagePoints.toLocaleString() + " XP",
  );
  // Capture the earned stage badge beside an honest all-blocked release ledger.
  await expedition.locator("#mission-desk").scrollIntoViewIfNeeded();
  await expedition.screenshot({
    path: resolve(out, "campaign-stage.png"),
    animations: "disabled",
  });
  // The two-tool side quest is complete independently of the full catalog.
  const samplerIds = ["SAMPLER-SPRITE", "SAMPLER-SONG", "SAMPLER-MOOD", "SAMPLER-RETURN"];
  const sampler = { schema: 1, meta: {}, records: {}, gaps: [] };
  await importCampaign(sampler);
  await expedition.locator("#start-tool-sampler").click();
  assert.equal(await expedition.locator("#story-SAMPLER-SPRITE").count(), 1);
  await expedition.locator("#next-mission").click();
  assert.equal(await expedition.locator("#story-SAMPLER-SONG").count(), 1);
  await expedition.locator("#next-mission").click();
  assert.equal(await expedition.locator("#story-SAMPLER-MOOD").count(), 1);
  await expedition.locator("#pause-campaign").click();
  await expedition.reload();
  await expedition.locator("#begin-expedition").click();
  assert.equal(await expedition.locator("#story-SAMPLER-MOOD").count(), 1);
  for (const id of samplerIds) {
    const mission = data.stories.find((s) => s.id === id);
    for (const key of ["story:" + id, ...mission.checks.map((c) => "check:" + c.id)])
      sampler.records[key] = { status: "blocked", notes: "QA only: catalog unavailable.", feel: "" };
  }
  await importCampaign(sampler);
  const scout = expedition.locator(".stamp").filter({ hasText: "Seed exchange scout" });
  assert.equal(await scout.getAttribute("data-earned"), "true");
  assert.equal(await expedition.locator("#xp-score").innerText(), "135 XP");
  assert.match(await expedition.locator("#story-score").innerText(), /^0 \/ /);
  await expedition.locator("#start-tool-sampler").click();
  await expedition.locator("#mission-desk").scrollIntoViewIfNeeded();
  await expedition.screenshot({ path: resolve(out, "tool-sampler.png"), animations: "disabled" });
  delete sampler.records["check:SAMPLER-RETURN-OUTCOME-1"];
  await importCampaign(sampler);
  assert.equal(await scout.getAttribute("data-earned"), "false");
  await expedition.locator("#start-tool-sampler").click();
  assert.equal(await expedition.locator("#story-SAMPLER-RETURN").count(), 1);
  const finale = {
    ...charted,
    records: {},
    campaign: { missionId: data.stories.at(-1).id },
  };
  for (const mission of data.stories)
    for (const id of [
      "story:" + mission.id,
      ...mission.checks.map((c) => "check:" + c.id),
    ])
      finale.records[id] = {
        status: "blocked",
        notes: "QA fixture only: outstanding prerequisite.",
        feel: "",
      };
  await importCampaign(finale);
  const maximum = data.ledger.criteria * 5 + data.stories.length * 15 + 1000;
  assert.equal(
    await expedition.locator("#xp-score").innerText(),
    maximum.toLocaleString() + " XP",
  );
  assert.match(
    await expedition.locator("#xp-level").innerText(),
    /Expedition fully charted/,
  );
  assert.equal(
    await expedition
      .locator("#passport-stamps .stamp[data-earned=true]")
      .count(),
    15,
    "Blocked fixtures earn no Bug spotter or Trail keeper badge",
  );
  assert.equal(await expedition.locator("#next-stage").isDisabled(), true);
  assert.match(await expedition.locator("#story-score").innerText(), /^0 \/ /);
  expedition.once("dialog", (d) => d.accept());
  await expedition.locator("#new-run").click();
  assert.equal(await expedition.locator("#xp-score").innerText(), "0 XP");
  assert.equal(await expedition.locator(".stamp[data-earned=true]").count(), 0);
  await expeditionContext.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(
    external,
    [],
    "Offline guide must not fetch third-party assets",
  );
  await writeFile(
    resolve(out, "verification.json"),
    JSON.stringify(
      {
        passed: true,
        stories: data.stories.length,
        criteria: data.ledger.criteria,
        baselineMapped: data.ledger.baselineMapped,
        creationChoices: data.ledger.creationChoices,
        checks: [
          "inventory mapping",
          "Explore tools/Mood sampler navigation, saved checkpoint, independent badge and evidence withdrawal",
          "persistent stage/mission checkpoints and exported resume state",
          "exact criterion/mission/stage XP and levels",
          "stage badges without false release passes",
          "no reward farming through editing or repeated import",
          "score correction and legacy/invalid checkpoint import",
          "new-run resets campaign and points",
          "ten-place expedition and keyboard map navigation",
          "mission focus/next/surprise/all and note preservation",
          "evidence-only stamps including documented failures",
          "blocked investigation never becomes a product pass",
          "derived stamp persistence and reduced motion",
          "fresh untested results",
          "route/search/child-result filters",
          "notes and metadata across reload",
          "JSON and complete readable exports",
          "atomic invalid-import refusal",
          "round-trip import",
          "literal unsafe text",
          "gap tracking",
          "keyboard",
          "390px and 200% zoom",
          "offline operation",
          "print criteria",
          "storage-refusal export",
          "immediate concurrent-tab warning, evidence preservation and export",
          "large run self-export/import and overlong-field atomic refusal",
        ],
        externalRequests: external,
        pageErrors: errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Story guide acceptance passed; evidence: " + out);
} finally {
  await browser.close();
}
