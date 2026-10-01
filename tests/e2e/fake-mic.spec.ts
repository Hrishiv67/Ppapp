import { chromium, expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The whole pipeline on a known recording: Chromium plays fixtures/rally-quiet.wav
 * as the microphone, the app listens through the real AudioWorklet and engine,
 * and the summary must match what the file contains.
 */
const FIXTURE = join(__dirname, "..", "..", "fixtures", "rally-quiet.wav");
const truth = JSON.parse(readFileSync(join(__dirname, "..", "..", "fixtures", "truth.json"), "utf8"))["rally-quiet.wav"].truth;
const longest = Math.max(...truth.rallies.map((r: { hits: number }) => r.hits));
const lastEnd = Math.max(...truth.rallies.map((r: { end: number }) => r.end));

test("a real rally recording through the fake microphone", async ({ baseURL }, info) => {
  test.skip(info.project.name !== "mobile", "one browser is enough for a 50-second listen");
  const browser = await chromium.launch({
    executablePath: process.env.RB_CHROMIUM || undefined,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${FIXTURE}`],
  });
  const page = await (await browser.newContext({ baseURL, permissions: ["microphone"] })).newPage();
  await page.goto("/play");
  await page.getByRole("button", { name: "Start listening" }).click();
  await expect(page.getByText("Listening")).toBeVisible();

  // Let the last rally finish and its 2-second end gap pass.
  await page.waitForTimeout((lastEnd + 3.5) * 1000);
  await expect(page.getByText("Best")).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByRole("heading", { name: /You played/ })).toBeVisible();
  const longestShown = Number(await page.locator("text=Longest").locator("..").locator(".num").innerText());
  expect(Math.abs(longestShown - longest)).toBeLessThanOrEqual(1);

  // The session was saved and shows up in the week.
  await page.goto("/week");
  await expect(page.getByRole("link", { name: new RegExp(`${longestShown} hits`) })).toBeVisible();
  await browser.close();
});
