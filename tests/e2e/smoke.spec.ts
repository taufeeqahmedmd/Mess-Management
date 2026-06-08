import { test, expect } from "@playwright/test";

test("dashboard renders the Phase 0 shell", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("counter screen prompts for a tap", async ({ page }) => {
  await page.goto("/counter");
  await expect(
    page.getByRole("heading", { name: "Tap a card to begin" }),
  ).toBeVisible();
});
