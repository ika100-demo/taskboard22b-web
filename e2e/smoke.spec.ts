import { expect, test } from "@playwright/test";

test.skip(!process.env.SMOKE_BASE_URL, "SMOKE_BASE_URL not set");

// Read-only, so it runs in every environment. A smoke test that creates or changes data also carries
// @writes in its title (or { tag: "@writes" }) and then runs only in dev (#474).

test("a created task appears in the list without a reload @smoke @writes", async ({ page }) => {
  const title = `smoke-${crypto.randomUUID()}`;
  await page.goto("/");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Due date").fill("2030-01-15");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("list", { name: "Tasks" }).getByText(title)).toBeVisible();
});

test("the root page loads at the base URL @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Tasks" })
      .or(page.getByText("No tasks yet"))
      .or(page.getByText("Tasks cannot be loaded right now. Please try again later.")),
  ).toBeVisible();
});
