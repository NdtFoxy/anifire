import { expect, test } from "@playwright/test";

// Full stack: Next.js pages -> auth-client -> Spring Boot -> Postgres.
// Guards the path every other feature depends on: an account can be created,
// the session survives navigation, protected pages reject anonymous visitors,
// and the same credentials sign back in.
test("register, reach the catalogue and profile, then sign back in", async ({ page, context }) => {
  const stamp = Date.now();
  const email = `e2e-${stamp}@anifire.test`;
  const name = `E2E Tester ${stamp}`;
  const password = "Crimson-Lantern-Wx9";

  await page.goto("/register");
  await page.locator("#name").fill(name);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();

  await expect(page).toHaveURL(/\/stream$/, { timeout: 20_000 });

  await page.goto("/profile");
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });

  // Anonymous visitors are bounced from protected pages to sign-in.
  await context.clearCookies();
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

  await page.goto("/profile");
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
});
