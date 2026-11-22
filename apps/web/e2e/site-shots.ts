import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { makePdf } from "../../../packages/ingest/src/__fixtures__/make-pdf";
import { addFlashcards, addPastedText, goto, runCommand } from "./support";

/**
 * Screenshots for the landing page (ADR-0044, doc 23). Each `shot(page, "<id>")` writes
 * apps/site/public/shots/<id>-light.png and <id>-dark.png; `pnpm site:check` compares these ids
 * with the ones apps/site/content/site.ts uses. When a screen changes, update its scene here.
 *
 * Runs with `pnpm site:shots` (playwright.shots.config.ts), never as part of the e2e suite.
 */
const OUT = join(import.meta.dirname, "../../site/public/shots");
/**
 * The example course matches the landing page demo: distributed systems (consistency and
 * consensus). These are our own short study notes, not text from any book.
 */
const NOTES_TITLE = "Consistency and consensus: study notes";
const PDF = {
  name: "consensus-notes.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(
    makePdf(
      [
        [
          NOTES_TITLE,
          "",
          "Linearizability makes a replicated system look like a single copy of the data.",
          "Every read returns the value of the most recent completed write.",
        ],
        [
          "Ordering guarantees",
          "",
          "Causal order respects happens-before, and is weaker than linearizability.",
          "Total order broadcast delivers every message to every node in the same order.",
        ],
        [
          "Consensus",
          "",
          "A majority quorum lets nodes agree even when a minority of them has crashed.",
          "Raft elects one leader per term, and the leader replicates its log to followers.",
        ],
        [
          "Two-phase commit",
          "",
          "If the coordinator fails after the participants vote yes, they must wait for it.",
        ],
      ],
      { title: NOTES_TITLE },
    ),
  ),
};
const PASSAGE = "Linearizability makes a replicated system look like a single copy of the data.";
const NOTES = [
  "Replication keeps a copy of the same data on several nodes, so the system survives a crash.",
  "A leader takes the writes and sends them to followers. Followers that lag behind serve stale reads.",
  "Consensus lets the nodes agree on one value. Raft needs votes from a majority to elect a leader.",
];

/**
 * Where things are on each screenshot, in 0..1 of the 1440x900 frame. The landing page's
 * walkthroughs move their cursor to these, so it always lands on the real button.
 * Written to apps/site/content/hotspots.json after the run.
 */
const HOTSPOTS: Record<string, Record<string, { x: number; y: number; w: number; h: number }>> = {};
const HOTSPOTS_FILE = join(import.meta.dirname, "../../site/content/hotspots.json");

async function hot(shotId: string, name: string, target: Locator) {
  const box = await target.first().boundingBox();
  if (!box) throw new Error(`No box for ${shotId}.${name}`);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  HOTSPOTS[shotId] ??= {};
  HOTSPOTS[shotId][name] = {
    x: r(box.x / 1440),
    y: r(box.y / 900),
    w: r(box.width / 1440),
    h: r(box.height / 900),
  };
}

async function shot(page: Page, id: string) {
  await mkdir(OUT, { recursive: true });
  // The dev server's Next.js badge is not part of the app.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    await page.screenshot({
      path: join(OUT, `${id}-${scheme}.png`),
      animations: "disabled",
      caret: "hide",
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

async function uploadPdf(page: Page): Promise<string> {
  await goto(page, "/");
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.locator("#pdf-upload").setInputFiles(PDF);
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: /consensus/i }) })
    .first();
  await expect(row).toContainText("Ready", { timeout: 30_000 });
  const href = await row
    .getByRole("link", { name: /consensus/i })
    .first()
    .getAttribute("href");
  if (!href) throw new Error("The uploaded PDF has no link.");
  return href;
}

async function selectInPdf(page: Page, text: string) {
  await expect(page.locator(".pdf-text-layer[data-ready='true']").first()).toBeAttached({
    timeout: 20_000,
  });
  await page.evaluate((want) => {
    const span = [...document.querySelectorAll(".pdf-text-layer span")].find((s) =>
      s.textContent?.includes(want),
    );
    const node = span?.firstChild;
    if (!span || !node) throw new Error(`No text layer span with "${want}"`);
    const range = document.createRange();
    const at = (node.textContent ?? "").indexOf(want);
    range.setStart(node, at);
    range.setEnd(node, at + want.length);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    span.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  }, text);
  const bar = page.getByRole("toolbar", { name: "Selected text" });
  await expect(bar).toBeVisible();
  return bar;
}

test.describe
  .serial("landing page screenshots", () => {
    let pdf = "";

    test.afterAll(async () => {
      await writeFile(HOTSPOTS_FILE, `${JSON.stringify(HOTSPOTS, null, 2)}\n`);
    });

    test("adding a source", async ({ page }) => {
      await goto(page, "/");
      const link = page.getByRole("tab", { name: "Link" });
      await hot("home", "linkTab", link);
      await shot(page, "home");
      await link.click();
      const url = page.getByRole("textbox", { name: "YouTube or web page link" });
      await url.fill("https://www.youtube.com/watch?v=rN6ma561tak");
      await hot("home-link", "urlField", url);
      await hot("home-link", "addButton", page.getByRole("button", { name: "Add link" }));
      await shot(page, "home-link");
    });

    test("workspace, chat, pdf and notes", async ({ page }) => {
      pdf = await uploadPdf(page);
      await goto(page, pdf);
      await expect(page.locator(".pdf-text-layer[data-ready='true']").first()).toBeAttached({
        timeout: 20_000,
      });
      await hot(
        "workspace",
        "chatInput",
        page.getByRole("textbox", { name: "Ask a question about this source" }),
      );
      await hot("workspace", "send", page.getByRole("button", { name: "Send question" }));
      await shot(page, "workspace");

      await page
        .getByRole("textbox", { name: "Ask a question about this source" })
        .fill("Why does consensus need a majority?");
      await page.getByRole("button", { name: "Send question" }).click();
      const chat = page.getByRole("region", { name: "Chat" });
      await expect(
        chat.getByRole("button", { name: /Go to page|Show page|p\.\d/ }).first(),
      ).toBeVisible();
      await hot("chat", "chip", chat.getByRole("button", { name: /Go to page|Show page|p\.\d/ }));
      await shot(page, "chat");

      await runCommand(page, "Workspace: Quiz layout");
      const bar = await selectInPdf(page, PASSAGE);
      await hot("pdf-select", "addToNotes", bar.getByRole("button", { name: "Add to notes" }));
      await shot(page, "pdf-select");
      await bar.getByRole("button", { name: "Add to notes" }).click();
      const notes = page.getByRole("tabpanel", { name: "Notes" });
      await expect(notes.locator("blockquote")).toContainText("single copy");
      await expect(notes.getByRole("status")).toHaveText("Saved");
      await page.keyboard.press("Escape");
      await hot("notes", "quote", notes.locator("blockquote"));
      await shot(page, "notes");

      // The PDF with its annotations list open beside the highlight.
      await page.getByRole("button", { name: /^Annotations/ }).click();
      await expect(page.getByText(PASSAGE).last()).toBeVisible();
      await shot(page, "pdf");
    });

    test("quiz and progress", async ({ page }) => {
      const path = await addPastedText(page, "Replication and consensus", NOTES);
      await goto(page, path);
      const quizTab = page.getByRole("tab", { name: "Quiz", exact: true });
      await quizTab.click();
      // Give the quiz the whole workspace, so the landing page shows it large.
      await quizTab
        .locator("xpath=ancestor::*[.//button[@aria-label='Maximise panel']][1]")
        .getByRole("button", { name: "Maximise panel" })
        .click();
      const quiz = page.getByRole("tabpanel", { name: "Quiz" });
      await quiz.getByRole("button", { name: "Generate quiz" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Generate a quiz" });
      await dialog.getByRole("spinbutton", { name: "Questions per topic" }).fill("4");
      await dialog.getByRole("button", { name: "Generate quiz" }).click();
      await quiz.getByRole("button", { name: "Start" }).first().click();
      const right = quiz.getByRole("radio", { name: "The claim the source supports" });
      await hot("quiz-q", "answer", right.locator("xpath=ancestor::label[1]"));
      await hot("quiz-q", "check", quiz.getByRole("button", { name: "Check answer" }));
      await shot(page, "quiz-q");
      await right.check();
      await quiz.getByRole("button", { name: "Check answer" }).click();
      await expect(quiz.getByRole("status")).toContainText("Correct");
      await hot("quiz", "feedback", quiz.getByRole("status"));
      await shot(page, "quiz");

      await addFlashcards(page, path, 6);
      await goto(page, "/progress");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await shot(page, "progress");
    });

    test("space dashboard", async ({ page }) => {
      await goto(page, "/");
      await page.getByRole("textbox", { name: "New space" }).fill("Distributed systems");
      await page.getByRole("button", { name: "Create space" }).click();
      await page
        .getByRole("link", { name: /Distributed systems/ })
        .first()
        .click();
      await page.waitForURL(/\/spaces\//);
      const space = new URL(page.url()).pathname;
      for (const [title, body] of [
        ["Replication", "Leaders send writes to followers. Lagging followers serve stale reads."],
        ["Consensus", "Raft elects one leader per term with votes from a majority of the nodes."],
      ] as const) {
        await goto(page, `${space}?tab=contents`);
        const panel = page.getByRole("tabpanel", { name: "Contents" });
        await panel.getByRole("tab", { name: "Paste" }).click();
        await panel
          .getByRole("textbox", { name: "Text to learn from" })
          .fill(`${title}\n\n${body}`);
        await panel.getByRole("button", { name: "Add text" }).click();
        await expect(panel.getByRole("link", { name: title })).toBeVisible({ timeout: 30_000 });
        const href = await panel.getByRole("link", { name: title }).getAttribute("href");
        if (href && title === "Consensus") await addFlashcards(page, href, 8);
      }
      await goto(page, `${space}?tab=overview`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Distributed systems" }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      await shot(page, "space");
    });

    test("planner", async ({ page }) => {
      await goto(page, "/planner");
      await page.getByRole("button", { name: "New plan" }).click();
      const dialog = page.getByRole("dialog", { name: "New study plan" });
      await dialog.getByLabel("Name").fill("Distributed systems final");
      const sunday = dialog.getByRole("button", { name: "Sun" });
      if ((await sunday.getAttribute("aria-pressed")) !== "true") await sunday.click();
      await dialog.getByRole("button", { name: "Create plan" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("region", { name: "Tasks for the day" })).toBeVisible();
      await shot(page, "planner");
    });

    test("whiteboard", async ({ page }) => {
      const path = await addPastedText(page, "Consensus and Raft", NOTES);
      await goto(page, path);
      const tab = page.getByRole("tab", { name: "Whiteboard", exact: true });
      await tab.click();
      await tab
        .locator("xpath=ancestor::*[.//button[@aria-label='Maximise panel']][1]")
        .getByRole("button", { name: "Maximise panel" })
        .click();
      const board = page.getByRole("tabpanel", { name: "Whiteboard" });
      await page.mouse.move(0, 0);
      await hot(
        "whiteboard-empty",
        "makeMap",
        board.getByRole("button", { name: "Make a mind map" }),
      );
      await shot(page, "whiteboard-empty");
      await board.getByRole("button", { name: "Make a mind map" }).click();
      await page
        .getByRole("dialog", { name: "Make a mind map" })
        .getByRole("button", { name: "Make mind map" })
        .click();
      await expect(
        board.getByRole("application", { name: "Whiteboard canvas" }).getByText("Source overview"),
      ).toBeVisible();
      await expect(board.getByText(/is mapping the source/)).toBeHidden({ timeout: 30_000 });
      await expect(board.getByText("Generating")).toBeHidden();
      // Clear the selection Claude's run leaves, so the map is shown plainly.
      await board
        .getByRole("application", { name: "Whiteboard canvas" })
        .click({ position: { x: 40, y: 600 } });
      await page.keyboard.press("Escape");
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await hot(
        "whiteboard",
        "root",
        board.getByRole("application", { name: "Whiteboard canvas" }).getByText("Source overview"),
      );
      await shot(page, "whiteboard");
    });

    test("settings", async ({ page }) => {
      await goto(page, "/settings");
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await shot(page, "settings");
    });

    test("the Modern look", async ({ page }) => {
      // ADR-0050: the second theme, set the way the app stores it.
      await page.addInitScript(() => localStorage.setItem("thoth.skin", "modern"));
      await goto(page, "/");
      await expect(
        page.getByRole("heading", { level: 1, name: "What do you want to learn today?" }),
      ).toBeVisible();
      await shot(page, "modern-home");
      await goto(page, pdf);
      await expect(page.getByRole("tablist", { name: "Tools" })).toBeVisible();
      await expect(page.locator(".pdf-text-layer[data-ready='true']").first()).toBeAttached({
        timeout: 20_000,
      });
      await shot(page, "modern-workspace");
    });
  });
