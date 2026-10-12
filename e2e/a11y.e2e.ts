import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/equipo", "/reglas", "/cuenta", "/ayuda"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accesibilidad (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    for (const path of PAGES) {
      test(`${path} no tiene problemas de accesibilidad`, async ({ page }) => {
        await page.goto(path);
        await page.waitForSelector("main");
        await page.waitForTimeout(1500); // fade-in animations finished (contrast is measured on the final colours)
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} · ${v.nodes[0]?.target.join(" ")}`);
        expect(summary, summary.join("\n")).toEqual([]);
      });
    }
  });
}
