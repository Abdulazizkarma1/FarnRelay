import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createAuthFixture } from "../fixtures/auth-network.js";
async function mockAuth(page) {
  const fixture = createAuthFixture();
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = request.url();
    if (
      !url.includes("fixture.supabase.co") &&
      !url.includes("/.netlify/functions/auth")
    )
      return route.continue();
    if (request.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
      });
    const body = request.postDataJSON() || {};
    const result = await fixture({ url, method: request.method(), body });
    if (result)
      return route.fulfill({
        status: result.status,
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
        body: result.body === null ? "" : JSON.stringify(result.body),
      });
    return route.fulfill({ status: 400, body: "{}" });
  });
}
test("signup advances to persisted waiting page, cooldown, verification and protected dashboard", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto("/signup");
  await page.getByLabel("Full name", { exact: true }).fill("Test Farmer");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("farmer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("A long field phrase 2026");
  await page
    .getByLabel("I agree to the terms and data notice", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(
    page.getByRole("heading", { name: "Check your email", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("farmer@example.test", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Password", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Resend in \d+s/ }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByText("farmer@example.test", { exact: true }),
  ).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(61000);
  await page.getByRole("button", { name: "Resend email", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Resend in \d+s/ }),
  ).toBeDisabled();
  await expect(
    page
      .getByText(
        "If this email can receive a verification link, a new email is on its way.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await page.goto("/?auth_action=signup&code=synthetic-verification-code");
  await page
    .getByRole("button", { name: "Continue securely", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Email verified, welcome to FarmRelay",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open my workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Test.", exact: true }),
  ).toBeVisible();
});
test("first typing does not validate, invalid submit focuses summary and links inline errors", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto("/signup");
  const email = page.getByLabel("Email address", { exact: true });
  await email.fill("not-an-email");
  await expect(
    page.getByText("Enter a valid email address.", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAttribute("aria-describedby", /auth-email-error/);
});
test("missing pending email redirects to signup and unknown routes recover", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto("/verify-email");
  await expect(page).toHaveURL(/\/signup$/);
  await page.goto("/does-not-exist");
  await expect(
    page.getByRole("heading", {
      name: "We could not find that page",
      exact: true,
    }),
  ).toBeVisible();
});
test("unverified login offers resend and never opens dashboard", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto("/login");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("farmer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("A long field phrase 2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Please verify your email",
  );
  await page
    .getByRole("button", { name: "Resend verification", exact: false })
    .count()
    .then(async (count) => {
      if (count)
        await page
          .getByRole("button", { name: "Resend verification", exact: false })
          .click();
      else
        await page
          .getByRole("button", { name: "Resend email", exact: true })
          .click();
    });
  await expect(page).toHaveURL(/\/verify-email$/);
});

test("landing and signup pass automated WCAG AA checks and fit a phone viewport", async ({
  page,
}) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  for (const path of ["/about", "/signup"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    await mkdir("artifacts/browser", { recursive: true });
    await page.screenshot({
      path: "artifacts/browser/" + path.slice(1) + ".png",
      fullPage: true,
    });
    const sizes = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
  }
});

test("changing a pending email preserves email only, never a password", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto("/signup");
  await page.getByLabel("Full name", { exact: true }).fill("Test Farmer");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("farmer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("A long field phrase 2026");
  await page
    .getByLabel("I agree to the terms and data notice", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await page
    .getByRole("link", { name: "Wrong email? Change it", exact: true })
    .click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "farmer@example.test",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});
test("password recovery gives a separate confirmation, then completes a new-password form", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto("/forgot-password");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("farmer@example.test");
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your email", exact: true }),
  ).toBeVisible();
  await page.goto("/?auth_action=recovery&code=synthetic-recovery-code");
  await page
    .getByRole("button", { name: "Continue securely", exact: true })
    .click();
  await page
    .getByLabel("New password", { exact: true })
    .fill("Another long field phrase 2026");
  await page
    .getByRole("button", { name: "Save new password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your password has changed. Sign in with your new password.",
      exact: true,
    }),
  ).toBeVisible();
});
