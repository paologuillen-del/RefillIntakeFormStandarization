// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html');

// ─── Helpers ────────────────────────────────────────────────────

async function fillStep0(page, {
  client = 'Ro Health',
  patientId = 'P001',
  patientEmail = 'patient@example.com',
  gender = 'male',
} = {}) {
  await page.locator('#clientTrigger').click();
  await page.locator('#clientSearch').fill(client);
  await page.locator(`.client-option[data-name="${client}"]`).click();
  await expect(page.locator('#clientTriggerText')).toHaveText(client);

  await page.locator('#patient-id').fill(patientId);
  await page.locator('#patient-email').fill(patientEmail);
  await page.locator(`.opt-item.radio[data-group="gender"][data-value="${gender}"]`).click();
}

async function pickOption(page, group, value) {
  await page.locator(`.opt-item[data-group="${group}"][data-value="${value}"]`).click();
}

async function next(page) {
  await page.locator('.step.active .btn-primary').click();
}

// Progress counter is "Step N of 16"; currentStep is 0-based so display = step+1
async function expectStep(page, n) {
  await expect(page.locator('#progressCount')).toHaveText(`Step ${n + 1} of 16`);
}

// Fast-forward through steps 1–3 (no changes) then step 4 (none)
async function passClinicialPrelude(page) {
  await pickOption(page, 'q1', 'no'); await next(page); // step 1
  await pickOption(page, 'q2', 'no'); await next(page); // step 2
  await pickOption(page, 'q3', 'no'); await next(page); // step 3
  await pickOption(page, 'q4', 'none'); await next(page); // step 4
}

// ─── afterEach: 10-second pause so you can read the final page ──
test.describe('Refill Intake Form — Happy Path', () => {

  test.afterEach(async ({ page }) => {
    await page.waitForTimeout(10_000);
  });

  // ════════════════════════════════════════════════
  // STEP 0  — Patient Information
  // ════════════════════════════════════════════════

  test('step 0 — all fields required, email and gender validated', async ({ page }) => {
    await page.goto(FILE_URL);
    await expectStep(page, 0);

    // Nothing filled → blocked
    page.once('dialog', d => d.accept());
    await next(page);
    await expectStep(page, 0);

    // Client selected, no ID → blocked
    await page.locator('#clientTrigger').click();
    await page.locator('#clientSearch').fill('LifeMD');
    await page.locator('.client-option[data-name="LifeMD"]').click();
    page.once('dialog', d => d.accept());
    await next(page);
    await expectStep(page, 0);

    // ID filled, bad email → blocked
    await page.locator('#patient-id').fill('P999');
    await page.locator('#patient-email').fill('not-an-email');
    page.once('dialog', d => d.accept());
    await next(page);
    await expectStep(page, 0);

    // Good email, no gender → blocked
    await page.locator('#patient-email').fill('test@clinic.com');
    page.once('dialog', d => d.accept());
    await next(page);
    await expectStep(page, 0);

    // Gender selected → advances
    await page.locator('.opt-item.radio[data-group="gender"][data-value="male"]').click();
    await next(page);
    await expectStep(page, 1);
  });

  test('step 0 — client search filters and keyboard navigation works', async ({ page }) => {
    await page.goto(FILE_URL);

    await page.locator('#clientTrigger').click();
    await page.locator('#clientSearch').fill('health');
    const options = page.locator('.client-option');
    const count = await options.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i++) {
      expect((await options.nth(i).textContent())?.toLowerCase()).toContain('health');
    }

    // No match
    await page.locator('#clientSearch').fill('zzznomatch');
    await expect(page.locator('.client-no-results')).toBeVisible();
  });

  // ════════════════════════════════════════════════
  // FULL HAPPY PATH  — male patient, no changes
  // ════════════════════════════════════════════════

  test('full happy path — male patient, no history changes, success + payload', async ({ page }) => {
    await page.goto(FILE_URL);
    await expect(page).toHaveTitle('Refill Intake Form | OpenLoop Health');

    // Step 0
    await fillStep0(page, { client: 'Ro Health', patientId: 'P456', patientEmail: 'john.doe@example.com', gender: 'male' });
    await next(page);

    // Male patient: female sub-section must NOT be visible in step 1
    await pickOption(page, 'q1', 'yes');
    await expect(page.locator('#q1-yes-block')).toBeVisible();
    await expect(page.locator('#female-sub-section')).not.toBeVisible();

    // Low-T option visible for males
    await expect(page.locator('#low-t-opt')).toBeVisible();
    // PCOS hidden for males
    await expect(page.locator('#pcos-opt')).not.toBeVisible();

    // Select none-of-the-above on all sub-sections
    await pickOption(page, 'q1-excl', 'none');
    await page.locator('#interval-changes').fill('No significant changes.');
    await pickOption(page, 'q1-clearance', 'none');
    await pickOption(page, 'q1-cond', 'none');
    await next(page); // step 2

    await pickOption(page, 'q2', 'no'); await next(page); // step 3
    await pickOption(page, 'q3', 'no'); await next(page); // step 4
    await pickOption(page, 'q4', 'none'); await next(page); // step 5
    await pickOption(page, 'q5', 'none'); await next(page); // step 7 (skips 6)
    await expectStep(page, 7);
    await pickOption(page, 'q7', 'energy'); await next(page);
    await page.locator('#weight').fill('185'); await next(page);
    await pickOption(page, 'q9', '4'); await next(page);
    await pickOption(page, 'q10', '6-10'); await next(page);
    await pickOption(page, 'q11', 'normal'); await next(page);
    await pickOption(page, 'q12', 'normal'); await next(page);
    await pickOption(page, 'q13', 'no-pref'); await next(page);
    await pickOption(page, 'q14', 'no'); await next(page);
    await page.locator('#q15-detail').fill('No additional notes.');
    await page.locator('.step.active .btn-primary').click();

    await expect(page.locator('#page-success')).toBeVisible();
    await expect(page.locator('#progressWrap')).toBeHidden();

    const payload = page.locator('#payload-success');
    await expect(payload).toContainText('"gender"');
    await expect(payload).toContainText('"Male"');
    await expect(payload).toContainText('P456');
    // Male patient: q2_female_only_exclusions should NOT appear
    await expect(payload).not.toContainText('q2_female_only_exclusions');
  });

  // ════════════════════════════════════════════════
  // FULL HAPPY PATH  — female patient, none of the below
  // ════════════════════════════════════════════════

  test('full happy path — female patient, female section shown, none-of-below, contraception note shown', async ({ page }) => {
    await page.goto(FILE_URL);

    await fillStep0(page, { client: 'Found Health', patientId: 'F001', patientEmail: 'jane@example.com', gender: 'female' });
    await next(page);

    await pickOption(page, 'q1', 'yes');
    // Female sub-section visible, PCOS visible, low-T hidden
    await expect(page.locator('#female-sub-section')).toBeVisible();
    await expect(page.locator('#pcos-opt')).toBeVisible();
    await expect(page.locator('#low-t-opt')).not.toBeVisible();

    await pickOption(page, 'q1-excl', 'none');
    await page.locator('#interval-changes').fill('Started new exercise program.');

    // Select "None of the below" in female section → contraception note appears
    await pickOption(page, 'q1-female', 'none');
    await expect(page.locator('#female-none-note')).toBeVisible();

    await pickOption(page, 'q1-clearance', 'none');
    await pickOption(page, 'q1-cond', 'none');
    await next(page);

    await pickOption(page, 'q2', 'no'); await next(page);
    await pickOption(page, 'q3', 'no'); await next(page);
    await pickOption(page, 'q4', 'none'); await next(page);
    await pickOption(page, 'q5', 'none'); await next(page);
    await pickOption(page, 'q7', 'sleep'); await next(page);
    await page.locator('#weight').fill('162'); await next(page);
    await pickOption(page, 'q9', '4'); await next(page);
    await pickOption(page, 'q10', '6-10'); await next(page);
    await pickOption(page, 'q11', 'normal'); await next(page);
    await pickOption(page, 'q12', 'normal'); await next(page);
    await pickOption(page, 'q13', 'no-pref'); await next(page);
    await pickOption(page, 'q14', 'no'); await next(page);
    await page.locator('.step.active .btn-primary').click();

    await expect(page.locator('#page-success')).toBeVisible();

    const payload = page.locator('#payload-success');
    await expect(payload).toContainText('"Female"');
    await expect(payload).toContainText('q2_female_only_exclusions');
    await expect(payload).not.toContainText('"Male"');
  });

  // ════════════════════════════════════════════════
  // GENDER VISIBILITY
  // ════════════════════════════════════════════════

  test('gender visibility — switching between male and female toggles sub-sections', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page, { gender: 'male' });
    await next(page);
    await pickOption(page, 'q1', 'yes');

    // Male: female section hidden, low-T visible, PCOS hidden
    await expect(page.locator('#female-sub-section')).not.toBeVisible();
    await expect(page.locator('#low-t-opt')).toBeVisible();
    await expect(page.locator('#pcos-opt')).not.toBeVisible();

    // Go back to step 0 and change to female
    await page.locator('.step.active .btn-outline').click();
    await page.locator('.opt-item.radio[data-group="gender"][data-value="female"]').click();
    await next(page);
    await pickOption(page, 'q1', 'yes');

    // Female: female section visible, PCOS visible, low-T hidden
    await expect(page.locator('#female-sub-section')).toBeVisible();
    await expect(page.locator('#pcos-opt')).toBeVisible();
    await expect(page.locator('#low-t-opt')).not.toBeVisible();
  });

  test('gender visibility — prefer-not-to-say shows both female section and low-T', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page, { gender: 'other' });
    await next(page);
    await pickOption(page, 'q1', 'yes');

    await expect(page.locator('#female-sub-section')).toBeVisible();
    await expect(page.locator('#pcos-opt')).toBeVisible();
    await expect(page.locator('#low-t-opt')).toBeVisible();
  });

  // ════════════════════════════════════════════════
  // DQ — FEMALE-SPECIFIC
  // ════════════════════════════════════════════════

  test('DQ — female + pregnant is excluded', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page, { gender: 'female', patientId: 'F-DQ1', patientEmail: 'preg@test.com' });
    await next(page);

    await pickOption(page, 'q1', 'yes');
    await pickOption(page, 'q1-excl', 'none');
    await page.locator('#interval-changes').fill('Became pregnant.');
    await pickOption(page, 'q1-female', 'pregnant');
    await pickOption(page, 'q1-clearance', 'none');
    await pickOption(page, 'q1-cond', 'none');
    await next(page);

    await expect(page.locator('#page-excluded')).toBeVisible();
    await expect(page.locator('#excluded-reason')).toContainText('pregnant');
    const payload = page.locator('#payload-excluded');
    await expect(payload).toContainText('"Female"');
    await expect(payload).toContainText('q2_female_only_exclusions');
    await expect(payload).toContainText('F-DQ1');
  });

  test('DQ — female + breastfeeding is excluded', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page, { gender: 'female', patientId: 'F-DQ2', patientEmail: 'bf@test.com' });
    await next(page);

    await pickOption(page, 'q1', 'yes');
    await pickOption(page, 'q1-excl', 'none');
    await page.locator('#interval-changes').fill('Currently breastfeeding.');
    await pickOption(page, 'q1-female', 'breastfeeding');
    await pickOption(page, 'q1-clearance', 'none');
    await pickOption(page, 'q1-cond', 'none');
    await next(page);

    await expect(page.locator('#page-excluded')).toBeVisible();
    await expect(page.locator('#excluded-reason')).toContainText('breastfeeding');
  });

  test('DQ — female + postpartum (<6 months) is NOT excluded (clearance note only)', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page, { gender: 'female', patientId: 'F-PP', patientEmail: 'pp@test.com' });
    await next(page);

    await pickOption(page, 'q1', 'yes');
    await pickOption(page, 'q1-excl', 'none');
    await page.locator('#interval-changes').fill('Gave birth 3 months ago.');
    await pickOption(page, 'q1-female', 'postpartum');
    await pickOption(page, 'q1-clearance', 'none');
    await pickOption(page, 'q1-cond', 'none');
    await next(page);

    // Should NOT be excluded — advances to step 2
    await expectStep(page, 2);
  });

  test('DQ — female section required when gender=female and q1=yes', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page, { gender: 'female' });
    await next(page);

    await pickOption(page, 'q1', 'yes');
    await pickOption(page, 'q1-excl', 'none');
    await page.locator('#interval-changes').fill('Some change.');
    // Skip female section → should block
    await pickOption(page, 'q1-clearance', 'none');
    await pickOption(page, 'q1-cond', 'none');
    page.once('dialog', d => d.accept());
    await next(page);
    await expectStep(page, 1);

    // Now fill female section → proceeds
    await pickOption(page, 'q1-female', 'none');
    await next(page);
    await expectStep(page, 2);
  });

  test('DQ — male patient skips female section entirely', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page, { gender: 'male' });
    await next(page);

    await pickOption(page, 'q1', 'yes');
    await pickOption(page, 'q1-excl', 'none');
    await page.locator('#interval-changes').fill('Some change.');
    // No female section interaction needed for male
    await pickOption(page, 'q1-clearance', 'none');
    await pickOption(page, 'q1-cond', 'none');
    await next(page);

    // Should advance without any alert about female section
    await expectStep(page, 2);
  });

  // ════════════════════════════════════════════════
  // DQ — MEDICAL EXCLUSIONS (generic)
  // ════════════════════════════════════════════════

  test('DQ — exclusion condition in history', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page); await next(page);

    await pickOption(page, 'q1', 'yes');
    await pickOption(page, 'q1-excl', 'pancreatitis'); // exclusion
    await pickOption(page, 'q1-clearance', 'none');
    await pickOption(page, 'q1-cond', 'none');
    await next(page);

    await expect(page.locator('#page-excluded')).toBeVisible();
    await expect(page.locator('#payload-excluded')).toContainText('P001');
  });

  test('DQ — CAD with active symptoms is excluded', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page); await next(page);

    await pickOption(page, 'q1', 'yes');
    await pickOption(page, 'q1-excl', 'none');
    await page.locator('#interval-changes').fill('Diagnosed with CAD.');
    await pickOption(page, 'q1-female', 'none'); // male default skips, but helper picks male so this won't show — keeping for safety via male path
    await pickOption(page, 'q1-clearance', 'none');
    await pickOption(page, 'q1-cond', 'cad');
    await expect(page.locator('#cad-block')).toBeVisible();
    await pickOption(page, 'cad-sub', 'chest-pain');
    await next(page);

    await expect(page.locator('#page-excluded')).toBeVisible();
    await expect(page.locator('#excluded-reason')).toContainText('coronary artery disease');
  });

  test('DQ — gallbladder not removed is excluded', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page); await next(page);

    await pickOption(page, 'q1', 'yes');
    await pickOption(page, 'q1-excl', 'none');
    await page.locator('#interval-changes').fill('Gallbladder issue noted.');
    await pickOption(page, 'q1-clearance', 'none');
    await pickOption(page, 'q1-cond', 'gallbladder');
    await expect(page.locator('#gallbladder-block')).toBeVisible();
    await pickOption(page, 'gb-sub', 'no');
    await next(page);

    await expect(page.locator('#page-excluded')).toBeVisible();
  });

  // ════════════════════════════════════════════════
  // STEP 1 — yes-branch, no exclusions
  // ════════════════════════════════════════════════

  test('step 1 — yes-branch with none-of-above, interval text required', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page, { gender: 'male' }); await next(page);

    await pickOption(page, 'q1', 'yes');
    await pickOption(page, 'q1-excl', 'none');
    await expect(page.locator('#interval-changes-block')).toBeVisible();

    page.once('dialog', d => d.accept());
    await next(page);
    await expectStep(page, 1);

    await page.locator('#interval-changes').fill('Minor lifestyle change.');
    await pickOption(page, 'q1-clearance', 'none');
    await pickOption(page, 'q1-cond', 'none');
    await next(page);
    await expectStep(page, 2);
  });

  // ════════════════════════════════════════════════
  // STEPS 2 & 3 — branch logic
  // ════════════════════════════════════════════════

  test('step 2 — allergy yes-branch requires free text', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page); await next(page);
    await pickOption(page, 'q1', 'no'); await next(page);

    await pickOption(page, 'q2', 'yes');
    page.once('dialog', d => d.accept());
    await next(page);
    await expectStep(page, 2);

    await page.locator('#allergy-list').fill('Penicillin – rash');
    await next(page);
    await expectStep(page, 3);
  });

  test('step 3 — medication yes-branch requires free text', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page); await next(page);
    await pickOption(page, 'q1', 'no'); await next(page);
    await pickOption(page, 'q2', 'no'); await next(page);

    await pickOption(page, 'q3', 'yes');
    page.once('dialog', d => d.accept());
    await next(page);
    await expectStep(page, 3);

    await page.locator('#medication-list').fill('Metformin 500mg twice daily');
    await next(page);
    await expectStep(page, 4);
  });

  // ════════════════════════════════════════════════
  // STEPS 5 & 6 — side effects
  // ════════════════════════════════════════════════

  test('step 5 — symptoms present routes to step 6 severity', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page); await next(page);
    await passClinicialPrelude(page);

    await pickOption(page, 'q5', 'nausea');
    await next(page);
    await expectStep(page, 6);

    await pickOption(page, 'q6', 'mild');
    await next(page);
    await expectStep(page, 7);
  });

  test('step 5 — hospitalization requires details', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page); await next(page);
    await passClinicialPrelude(page);

    await pickOption(page, 'q5', 'hospitalization');
    page.once('dialog', d => d.accept());
    await next(page);
    await expectStep(page, 5);

    await page.locator('#hosp-detail').fill('Dehydration, discharged same day.');
    await next(page);
    await expectStep(page, 6);
  });

  test('step 6 — moderate severity requires explanation', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page); await next(page);
    await passClinicialPrelude(page);
    await pickOption(page, 'q5', 'nausea'); await next(page);

    await pickOption(page, 'q6', 'moderate');
    page.once('dialog', d => d.accept());
    await next(page);
    await expectStep(page, 6);

    await page.locator('#q6a-detail').fill('Nausea lasts ~6 hours post-injection.');
    await next(page);
    await expectStep(page, 7);
  });

  // ════════════════════════════════════════════════
  // STEP 9 — too soon
  // ════════════════════════════════════════════════

  test('DQ — too soon (1 injection) shows special page with payload', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page, { patientId: 'P100', patientEmail: 'early@patient.com' }); await next(page);
    await passClinicialPrelude(page);
    await pickOption(page, 'q5', 'none'); await next(page);
    await pickOption(page, 'q7', 'energy'); await next(page);
    await page.locator('#weight').fill('200'); await next(page);

    await pickOption(page, 'q9', '1');
    await next(page);

    await expect(page.locator('#page-too-soon')).toBeVisible();
    await expect(page.locator('#payload-soon')).toContainText('P100');
    await expect(page.locator('#payload-soon')).toContainText('early@patient.com');
  });

  // ════════════════════════════════════════════════
  // STEP 11 & 12 — vitals exclusions
  // ════════════════════════════════════════════════

  test('DQ — blood pressure ≥160/100 excluded, payload shown', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page, { patientId: 'P200', patientEmail: 'bp@patient.com' }); await next(page);
    await passClinicialPrelude(page);
    await pickOption(page, 'q5', 'none'); await next(page);
    await pickOption(page, 'q7', 'energy'); await next(page);
    await page.locator('#weight').fill('200'); await next(page);
    await pickOption(page, 'q9', '4'); await next(page);
    await pickOption(page, 'q10', '6-10'); await next(page);

    await pickOption(page, 'q11', 'crisis');
    await next(page);

    await expect(page.locator('#page-excluded')).toBeVisible();
    await expect(page.locator('#payload-excluded')).toContainText('P200');
    await expect(page.locator('#payload-excluded')).toContainText('q14_current_or_average_blood_pressure_range');
  });

  test('DQ — heart rate >110 bpm excluded', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page, { patientId: 'P300', patientEmail: 'hr@patient.com' }); await next(page);
    await passClinicialPrelude(page);
    await pickOption(page, 'q5', 'none'); await next(page);
    await pickOption(page, 'q7', 'energy'); await next(page);
    await page.locator('#weight').fill('200'); await next(page);
    await pickOption(page, 'q9', '4'); await next(page);
    await pickOption(page, 'q10', '6-10'); await next(page);
    await pickOption(page, 'q11', 'normal'); await next(page);

    await pickOption(page, 'q12', 'fast');
    await next(page);

    await expect(page.locator('#page-excluded')).toBeVisible();
    await expect(page.locator('#payload-excluded')).toContainText('q15_current_or_average_heart_rate_range');
  });

  // ════════════════════════════════════════════════
  // STEP 13 — dose preference
  // ════════════════════════════════════════════════

  test('step 13 — dose preference requires explanation', async ({ page }) => {
    await page.goto(FILE_URL);
    await fillStep0(page); await next(page);
    await passClinicialPrelude(page);
    await pickOption(page, 'q5', 'none'); await next(page);
    await pickOption(page, 'q7', 'energy'); await next(page);
    await page.locator('#weight').fill('185'); await next(page);
    await pickOption(page, 'q9', '4'); await next(page);
    await pickOption(page, 'q10', '6-10'); await next(page);
    await pickOption(page, 'q11', 'normal'); await next(page);
    await pickOption(page, 'q12', 'normal'); await next(page);

    await pickOption(page, 'q13', 'increase');
    await expect(page.locator('#q13a-block')).toBeVisible();
    page.once('dialog', d => d.accept());
    await next(page);
    await expectStep(page, 13);

    await page.locator('#q13a-detail').fill('Tolerating current dose well.');
    await next(page);
    await expectStep(page, 14);
  });
});
