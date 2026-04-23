// @ts-check
const { test, expect } = require('@playwright/test');

const LIVE_URL = 'https://refill-intake-form-standarization.vercel.app/';

async function pickOption(page, group, value) {
  await page.locator(`.opt-item[data-group="${group}"][data-value="${value}"]`).click();
}

async function next(page) {
  await page.locator('.step.active .btn-primary').click();
}

test.describe('Live — Vercel submission', () => {
  test.use({ slowMo: 0 }); // no artificial delay against the live site

  test('happy path — patient 11425832 submits successfully', async ({ page }) => {
    await page.goto(LIVE_URL, { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle('Refill Intake Form | OpenLoop Health');

    // ── Step 0: Patient info ──────────────────────────────────────
    await page.locator('#clientTrigger').click();
    await page.locator('#clientSearch').fill('Ro Health');
    await page.locator('.client-option[data-name="Ro Health"]').click();
    await page.locator('#patient-id').fill('11425832');
    await page.locator('#patient-email').fill('brian.mejia+bwctest2@openloophealth.com+17863251948');
    await page.locator('.opt-item.radio[data-group="gender"][data-value="male"]').click();
    await next(page);

    // ── Step 1: No medical history changes ───────────────────────
    await pickOption(page, 'q1', 'no');
    await next(page);

    // ── Step 2: No allergy changes ───────────────────────────────
    await pickOption(page, 'q2', 'no');
    await next(page);

    // ── Step 3: No medication changes ────────────────────────────
    await pickOption(page, 'q3', 'no');
    await next(page);

    // ── Step 4: No serious symptoms ──────────────────────────────
    await pickOption(page, 'q4', 'none');
    await next(page);

    // ── Step 5: No side effects (skips severity step) ────────────
    await pickOption(page, 'q5', 'none');
    await next(page);

    // ── Step 7: Benefits ─────────────────────────────────────────
    await pickOption(page, 'q7', 'energy');
    await next(page);

    // ── Step 8: Weight ───────────────────────────────────────────
    await page.locator('#weight').fill('185');
    await next(page);

    // ── Step 9: Injections completed (≥3 avoids too-soon DQ) ────
    await pickOption(page, 'q9', '4');
    await next(page);

    // ── Step 10: Last dose ───────────────────────────────────────
    await pickOption(page, 'q10', '6-10');
    await next(page);

    // ── Step 11: Blood pressure ──────────────────────────────────
    await pickOption(page, 'q11', 'normal');
    await next(page);

    // ── Step 12: Heart rate ──────────────────────────────────────
    await pickOption(page, 'q12', 'normal');
    await next(page);

    // ── Step 13: Dose preference ─────────────────────────────────
    await pickOption(page, 'q13', 'no-pref');
    await next(page);

    // ── Step 14: Ondansetron ─────────────────────────────────────
    await pickOption(page, 'q14', 'no');
    await next(page);

    // ── Step 15: Shipping address ────────────────────────────────
    await page.locator('#shipping-street').fill('317 6th Ave Suite #400');
    await page.locator('#shipping-city').fill('Des Moines');
    await page.locator('#shipping-state').fill('IA');
    await page.locator('#shipping-zip').fill('50309');
    await page.locator('#shipping-country').fill('United States');
    await next(page);

    // ── Step 16: Additional info (optional) — submit ─────────────
    await page.locator('.step.active .btn-primary').click();

    // Wait up to 20 s for the API call to complete and success page to appear
    await expect(page.locator('#page-success')).toBeVisible({ timeout: 20_000 });
  });
});
