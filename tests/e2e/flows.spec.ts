import { expect, test } from "@playwright/test";

test("first launch offers start and a sample week", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A log for your ping pong." })).toBeVisible();
  await page.getByRole("link", { name: "See a sample week" }).click();
  await expect(page.getByText("This week")).toBeVisible();
  await expect(page.getByText("Demo").first()).toBeVisible();
});

test("sample week opens a session summary and the report", async ({ page }) => {
  await page.goto("/?demo=1");
  await page.getByRole("link", { name: /Last time/ }).click();
  await expect(page.getByRole("heading", { name: /You played \d+ minutes/ })).toBeVisible();
  await expect(page.getByText("Steady window")).toBeVisible();
  await page.getByRole("link", { name: "Report for my therapist" }).click();
  await expect(page.getByText("Activity report")).toBeVisible();
});

test("day bars read out their exact value when tapped", async ({ page }) => {
  await page.goto("/week?demo=1");
  const bar = page.getByRole("button", { name: /minutes$/ }).first();
  await bar.click();
  await expect(bar).toHaveAttribute("aria-pressed", "true");
});

test("microphone denied explains how to fix it", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, permissions: [] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.goto("/play");
  await page.getByRole("button", { name: "Start listening" }).click();
  await expect(page.getByRole("heading", { name: "We can’t hear the ball yet." })).toBeVisible();
  await expect(page.getByText("iPhone")).toBeVisible();
});
