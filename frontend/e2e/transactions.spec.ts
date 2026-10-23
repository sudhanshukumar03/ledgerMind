import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";

test("manual pages update freshness and retain exact large paise", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/transactions");
  await expect(page.getByText("Just updated", { exact: true })).toBeVisible();
  await expect(
    page.getByText("\u20b99,00,71,99,25,47,409.93", { exact: true }).first(),
  ).toBeVisible();
  const request = page.waitForRequest(
    (r) => new URL(r.url()).searchParams.get("method") === "upi",
  );
  await page.locator("select").nth(1).selectOption("upi");
  await request;
});

test("failed reads show an error instead of a successful empty list", async ({
  page,
}) => {
  await fixture(page, { scenario: "read-failure" });
  await page.goto("/transactions");
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable to load payments" }),
  ).toBeVisible();
  await expect(page.getByText("No payments found", { exact: true })).toHaveCount(0);
  await page.goto("/audit");
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable to load audit" }),
  ).toBeVisible();
});

test("switching drawer entity ignores the previous slow response", async ({
  page,
}) => {
  await fixture(page, { scenario: "slow-first" });
  await page.goto("/transactions");
  await page.locator("tbody tr").filter({ hasText: "pay_fixture_A" }).click();
  await page
    .locator("tbody tr")
    .filter({ hasText: "pay_fixture_B" })
    .dispatchEvent("click");
  await expect(
    page.getByRole("dialog").getByText("pay_fixture_B", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(700);
  await expect(
    page.getByRole("dialog").getByText("pay_fixture_B", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("pay_fixture_A", { exact: true }),
  ).toHaveCount(0);
});
