import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/?demo=1", "/week?demo=1", "/session?id=demo-0&demo=1", "/report?demo=1", "/about", "/play"];

for (const route of ROUTES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${route} has no WCAG AA violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`)).toEqual([]);
    });
  }
}
