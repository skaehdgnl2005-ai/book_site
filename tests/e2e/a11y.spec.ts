import { test, expect } from "@playwright/test";

// F037 — basic a11y regression net across the user-facing pages. Asserts the three
// concerns the feature names: (1) heading order (page starts at h1, no skipped levels),
// (2) every form control has an accessible name (label[for] / wrapping <label> / aria-*),
// (3) every <img> carries an alt attribute.
//
// This is a hand-rolled DOM audit (no axe dependency — keeps `pnpm check` hermetic and
// dep-pinned). To prove the audit is not vacuous, the first test feeds it a deliberately
// broken fixture and asserts it flags all three classes (the "teeth" test); only then do
// the per-page tests assert zero violations. Same audit function, both directions.

type Violation = { type: string; detail: string };
type AuditResult = { headings: number[]; violations: Violation[] };

/**
 * Runs IN THE BROWSER (serialized by page.evaluate). Audits the subtree at
 * `rootSelector` (default <body>) and returns heading levels + a11y violations.
 * Self-contained: no closures over Node scope.
 */
function a11yAudit(rootSelector: string): AuditResult {
  const root = document.querySelector(rootSelector) ?? document.body;
  const violations: Violation[] = [];

  const accessibleName = (el: Element): string => {
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const txt = labelledby
        .split(/\s+/)
        .map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ")
        .trim();
      if (txt) return txt;
    }
    const aria = el.getAttribute("aria-label")?.trim();
    if (aria) return aria;
    const id = el.getAttribute("id");
    if (id) {
      const forLabel = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
      const t = forLabel?.textContent?.trim();
      if (t) return t;
    }
    const wrapping = el.closest("label");
    if (wrapping && wrapping.textContent?.trim()) return wrapping.textContent.trim();
    const title = el.getAttribute("title")?.trim();
    if (title) return title;
    return "";
  };

  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type");
    const name = el.getAttribute("name") ?? el.getAttribute("id");
    return `${tag}${type ? `[type=${type}]` : ""}${name ? `#${name}` : ""}`;
  };

  // (2) Form controls need an accessible name. Non-labelable types are exempt.
  const SKIP = new Set(["hidden", "submit", "button", "reset", "image"]);
  root.querySelectorAll("input, select, textarea").forEach((el) => {
    if (el.tagName === "INPUT") {
      const t = (el.getAttribute("type") ?? "text").toLowerCase();
      if (SKIP.has(t)) return;
    }
    if (!accessibleName(el)) {
      violations.push({ type: "control-without-label", detail: describe(el) });
    }
  });

  // (3) Every image carries an alt (empty alt is allowed for decorative — but it must exist).
  root.querySelectorAll("img").forEach((img) => {
    if (!img.hasAttribute("alt")) {
      violations.push({ type: "img-without-alt", detail: img.getAttribute("src") ?? "(no src)" });
    }
  });

  // (1) Heading order: first heading is h1; no descending level skips (h2→h4 is a skip).
  const headings = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => ({
    level: Number(h.tagName[1]),
    text: (h.textContent ?? "").trim().slice(0, 40),
  }));
  if (headings.length > 0) {
    if (headings[0].level !== 1) {
      violations.push({
        type: "no-top-h1",
        detail: `first heading is h${headings[0].level} ("${headings[0].text}")`,
      });
    }
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].level > headings[i - 1].level + 1) {
        violations.push({
          type: "heading-skip",
          detail: `h${headings[i - 1].level}→h${headings[i].level} ("${headings[i].text}")`,
        });
      }
    }
  }

  return { headings: headings.map((h) => h.level), violations };
}

// Pages that render their full content (incl. forms) on direct navigation — no prior
// cart/auth state required. Covers home, both categories, the order wizard form, cart,
// checkout, all content pages, and both custom-intake forms.
const PAGES = [
  "/",
  "/anniversary",
  "/first-moments",
  "/order/birth",
  "/cart",
  "/checkout",
  "/contact",
  "/faq",
  "/gallery",
  "/brand-story",
  "/reviews",
  "/custom",
  "/custom/written",
  "/custom/phone",
];

test.describe("a11y — heading order, form labels, image alt (F037)", () => {
  test("the audit detects missing labels, missing alt, and skipped headings (teeth)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const fixture = document.createElement("div");
      fixture.id = "__a11y_fixture__";
      fixture.innerHTML =
        "<h1>ok</h1><h4>skipped</h4>" + // heading-skip (h1→h4)
        '<input type="text" />' + // control-without-label
        '<img src="decorative.png" />'; // img-without-alt
      document.body.appendChild(fixture);
    });
    const { violations } = await page.evaluate(a11yAudit, "#__a11y_fixture__");
    const types = violations.map((v) => v.type);
    expect(types).toContain("heading-skip");
    expect(types).toContain("control-without-label");
    expect(types).toContain("img-without-alt");
  });

  for (const path of PAGES) {
    test(`${path} — clean heading order, labelled controls, alt on images`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      const result = await page.evaluate(a11yAudit, "body");
      expect(
        result.violations,
        `${path} a11y violations: ${JSON.stringify(result.violations, null, 2)}\nheadings: ${result.headings.join(",")}`,
      ).toEqual([]);
    });
  }

  // The page sweep above only sees each route's INITIAL render. The order wizard reveals
  // new controls per step (the photo file input, the cover radios), so walk it and audit
  // each step's subtree — otherwise a control surfaced only mid-funnel (e.g. an unlabelled
  // file input) escapes the net.
  const WIZARD = '[data-testid="order-wizard"]';
  test("/order/birth — every wizard step is a11y-clean (controls named at each step)", async ({
    page,
  }) => {
    await page.goto("/order/birth");
    const auditWizard = async () => (await page.evaluate(a11yAudit, WIZARD)).violations;

    // info step
    expect(await auditWizard()).toEqual([]);

    // → photo step: the file input must carry an accessible name
    await page.getByTestId("order-name-input").fill("도윤");
    await page.getByTestId("order-gender-male").check();
    await page.getByTestId("order-extravar-input").fill("2024-01-15");
    await page.getByTestId("order-next").click();
    await expect(page.locator(WIZARD)).toHaveAttribute("data-step", "photo");
    expect(await auditWizard()).toEqual([]);

    // → cover step
    await page.getByTestId("order-photo-skip").click();
    await expect(page.locator(WIZARD)).toHaveAttribute("data-step", "cover");
    expect(await auditWizard()).toEqual([]);
  });

  // The order wizard was the only form whose validation errors were not announced to
  // assistive tech (every other form already uses role="alert"). Errors must be in a live
  // region and the offending field marked aria-invalid (the aria-* item deferred to F037).
  test("/order/birth — invalid submit announces field errors and marks the input invalid", async ({
    page,
  }) => {
    await page.goto("/order/birth");
    await page.getByTestId("order-next").click(); // submit empty → validation errors

    const nameErr = page.getByTestId("order-error-childName");
    await expect(nameErr).toBeVisible();
    await expect(nameErr).toHaveAttribute("role", "alert");
    await expect(page.getByTestId("order-name-input")).toHaveAttribute("aria-invalid", "true");
  });

  test("/order/birth — photo upload error is announced (role=alert)", async ({ page }) => {
    await page.goto("/order/birth");
    await page.getByTestId("order-name-input").fill("도윤");
    await page.getByTestId("order-gender-male").check();
    await page.getByTestId("order-extravar-input").fill("2024-01-15");
    await page.getByTestId("order-next").click();
    await expect(page.locator(WIZARD)).toHaveAttribute("data-step", "photo");

    await page.getByTestId("order-photo-input").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });
    const photoErr = page.getByTestId("order-photo-error");
    await expect(photoErr).toBeVisible();
    await expect(photoErr).toHaveAttribute("role", "alert");
  });
});
