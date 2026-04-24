// @ts-check
// Live integration tests for:
//   • modality (async_visit / sync_visit) set by the frontend based on clinical answers
//   • createTicket determined server-side by the OLH patient-check API
//   • payload reaching both /api/submit and the Zoho webhook
//
// Run against the deployed Vercel app:
//   npx playwright test tests/webhook-modality.spec.js
//
// NOTE: these tests create real form submissions. Use test patient IDs only.

const { test, expect } = require('@playwright/test');

const LIVE_URL = 'https://refill-intake-form-standarization.vercel.app/';

// ─── Shared helpers ──────────────────────────────────────────────

async function pickOption(page, group, value) {
  await page.locator(`.opt-item[data-group="${group}"][data-value="${value}"]`).click();
}

async function next(page) {
  await page.locator('.step.active .btn-primary').click();
}

async function fillStep0(page, {
  client      = 'Ro Health',
  patientId   = '11425832',
  patientEmail = 'test+modality@openloophealth.com',
  gender      = 'male',
} = {}) {
  await page.locator('#clientTrigger').click();
  await page.locator('#clientSearch').fill(client);
  await page.locator(`.client-option[data-name="${client}"]`).click();
  await page.locator('#patient-id').fill(patientId);
  await page.locator('#patient-email').fill(patientEmail);
  await page.locator(`.opt-item.radio[data-group="gender"][data-value="${gender}"]`).click();
  await next(page);
}

// Steps 1-4: no changes, no serious symptoms
async function passClinicalPrelude(page) {
  await pickOption(page, 'q1', 'no'); await next(page);
  await pickOption(page, 'q2', 'no'); await next(page);
  await pickOption(page, 'q3', 'no'); await next(page);
  await pickOption(page, 'q4', 'none'); await next(page);
}

// Steps 7-15: benefits through shipping, all defaults
async function completeRemainingSteps(page) {
  await pickOption(page, 'q7', 'energy'); await next(page);
  await page.locator('#weight').fill('185'); await next(page);
  await pickOption(page, 'q9', '4'); await next(page);
  await pickOption(page, 'q10', '6-10'); await next(page);
  await pickOption(page, 'q11', 'normal'); await next(page);
  await pickOption(page, 'q12', 'normal'); await next(page);
  await pickOption(page, 'q13', 'no-pref'); await next(page);
  await pickOption(page, 'q14', 'no'); await next(page);
  await page.locator('#shipping-street').fill('317 6th Ave Suite 400');
  await page.locator('#shipping-city').fill('Des Moines');
  await page.locator('#shipping-state').fill('IA');
  await page.locator('#shipping-zip').fill('50309');
  await page.locator('#shipping-country').fill('United States');
  await next(page);
  // Step 16: submit without additional notes
  await page.locator('.step.active .btn-primary').click();
}

// Captures the POST body sent from the browser to /api/submit.
// Returns a promise that resolves with the parsed payload object.
function captureSubmitPayload(page) {
  return new Promise(resolve => {
    page.on('request', req => {
      if (req.method() === 'POST' && req.url().includes('/api/submit')) {
        try { resolve(JSON.parse(req.postData() || '{}')); } catch { resolve({}); }
      }
    });
  });
}

// ─── Tests ──────────────────────────────────────────────────────

test.describe('Webhook & Modality — Live Integration', () => {
  test.use({ slowMo: 200 });

  // ════════════════════════════════════════════════
  // MODALITY: async_visit
  // ════════════════════════════════════════════════

  test('modality async_visit — no side effects, no severity step', async ({ page }) => {
    const payloadPromise = captureSubmitPayload(page);

    await page.goto(LIVE_URL, { waitUntil: 'networkidle' });
    await fillStep0(page);
    await passClinicalPrelude(page);

    // Step 5: none → skips severity step entirely
    await pickOption(page, 'q5', 'none');
    await next(page);

    await completeRemainingSteps(page);

    await expect(page.locator('#page-success')).toBeVisible({ timeout: 20_000 });

    // Verify what the browser sent to /api/submit
    const payload = await payloadPromise;
    expect(payload.modality).toBe('async_visit');

    // Also verify via the displayed payload on the success page
    await expect(page.locator('#payload-success')).toContainText('"async_visit"');
  });

  test('modality async_visit — mild symptoms do not trigger sync', async ({ page }) => {
    const payloadPromise = captureSubmitPayload(page);

    await page.goto(LIVE_URL, { waitUntil: 'networkidle' });
    await fillStep0(page);
    await passClinicalPrelude(page);

    // Step 5: nausea → goes to step 6
    await pickOption(page, 'q5', 'nausea');
    await next(page);

    // Step 6: mild severity → should NOT trigger sync_visit
    await pickOption(page, 'q6', 'mild');
    await next(page);

    await completeRemainingSteps(page);

    await expect(page.locator('#page-success')).toBeVisible({ timeout: 20_000 });

    const payload = await payloadPromise;
    expect(payload.modality).toBe('async_visit');
    await expect(page.locator('#payload-success')).toContainText('"async_visit"');
  });

  // ════════════════════════════════════════════════
  // MODALITY: sync_visit via hospitalization
  // ════════════════════════════════════════════════

  test('modality sync_visit — hospitalization reported in side effects', async ({ page }) => {
    const payloadPromise = captureSubmitPayload(page);

    await page.goto(LIVE_URL, { waitUntil: 'networkidle' });
    await fillStep0(page);
    await passClinicalPrelude(page);

    // Step 5: select hospitalization (requires free text detail)
    await pickOption(page, 'q5', 'hospitalization');
    await page.locator('#hosp-detail').fill('Admitted for dehydration, discharged same day.');
    await next(page);

    // Step 6: severity shown — mild (hospitalization alone triggers sync regardless)
    await pickOption(page, 'q6', 'mild');
    await next(page);

    await completeRemainingSteps(page);

    await expect(page.locator('#page-success')).toBeVisible({ timeout: 20_000 });

    const payload = await payloadPromise;
    expect(payload.modality).toBe('sync_visit');
    await expect(page.locator('#payload-success')).toContainText('"sync_visit"');
  });

  // ════════════════════════════════════════════════
  // MODALITY: sync_visit via severe symptoms
  // ════════════════════════════════════════════════

  test('modality sync_visit — symptoms classified as severe', async ({ page }) => {
    const payloadPromise = captureSubmitPayload(page);

    await page.goto(LIVE_URL, { waitUntil: 'networkidle' });
    await fillStep0(page);
    await passClinicalPrelude(page);

    // Step 5: nausea + vomiting (non-hospitalization symptoms)
    await pickOption(page, 'q5', 'nausea');
    await pickOption(page, 'q5', 'vomiting');
    await next(page);

    // Step 6: severe severity → triggers sync_visit
    await pickOption(page, 'q6', 'severe');
    await page.locator('#q6a-detail').fill('Vomiting 3–4 times per day, unable to keep food down.');
    await next(page);

    await completeRemainingSteps(page);

    await expect(page.locator('#page-success')).toBeVisible({ timeout: 20_000 });

    const payload = await payloadPromise;
    expect(payload.modality).toBe('sync_visit');
    await expect(page.locator('#payload-success')).toContainText('"sync_visit"');
  });

  test('modality sync_visit — hospitalization + severe both present', async ({ page }) => {
    const payloadPromise = captureSubmitPayload(page);

    await page.goto(LIVE_URL, { waitUntil: 'networkidle' });
    await fillStep0(page);
    await passClinicalPrelude(page);

    await pickOption(page, 'q5', 'hospitalization');
    await pickOption(page, 'q5', 'nausea');
    await page.locator('#hosp-detail').fill('Admitted for severe nausea, 1 night stay.');
    await next(page);

    await pickOption(page, 'q6', 'severe');
    await page.locator('#q6a-detail').fill('Persistent vomiting leading to hospitalization.');
    await next(page);

    await completeRemainingSteps(page);

    await expect(page.locator('#page-success')).toBeVisible({ timeout: 20_000 });

    const payload = await payloadPromise;
    expect(payload.modality).toBe('sync_visit');
    await expect(page.locator('#payload-success')).toContainText('"sync_visit"');
  });

  // ════════════════════════════════════════════════
  // createTicket — server-side patient check
  // Both cases should reach the success page; createTicket value is
  // determined server-side and sent to the Zoho webhook, not visible
  // in the browser payload. Verify in Zoho Flow execution logs.
  // ════════════════════════════════════════════════

  test('createTicket false — known patient 11425832 submits successfully', async ({ page }) => {
    // Patient 11425832 exists → server sets createTicket: false in Zoho payload
    const payloadPromise = captureSubmitPayload(page);

    await page.goto(LIVE_URL, { waitUntil: 'networkidle' });
    await fillStep0(page, {
      patientId:    '11425832',
      patientEmail: 'brian.mejia+bwctest2@openloophealth.com',
    });
    await passClinicalPrelude(page);
    await pickOption(page, 'q5', 'none'); await next(page);
    await completeRemainingSteps(page);

    await expect(page.locator('#page-success')).toBeVisible({ timeout: 20_000 });

    // Browser payload should NOT contain createTicket (it's server-side only)
    const payload = await payloadPromise;
    expect(payload).not.toHaveProperty('createTicket');
    // Modality is async (no sync triggers)
    expect(payload.modality).toBe('async_visit');
  });

  test('createTicket true — unknown patient sends webhook with createTicket true', async ({ page }) => {
    // Patient TEST-NOTFOUND-000 does not exist → server sets createTicket: true
    // Form still completes successfully (both API calls always fire)
    const payloadPromise = captureSubmitPayload(page);

    await page.goto(LIVE_URL, { waitUntil: 'networkidle' });
    await fillStep0(page, {
      patientId:    'TEST-NOTFOUND-000',
      patientEmail: 'test+notfound@openloophealth.com',
    });
    await passClinicalPrelude(page);
    await pickOption(page, 'q5', 'none'); await next(page);
    await completeRemainingSteps(page);

    // Server should still return success (both endpoints are hit regardless)
    await expect(page.locator('#page-success')).toBeVisible({ timeout: 20_000 });

    const payload = await payloadPromise;
    expect(payload).not.toHaveProperty('createTicket'); // added server-side
    // Confirm in Zoho Flow execution log that createTicket === true for this run
  });
});
