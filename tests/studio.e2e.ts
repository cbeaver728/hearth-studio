import { test, expect } from '@playwright/test';
test('starter renders cleanly, walkthrough exits, exterior image exports', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your home, taking shape.' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('All changes saved on this device')).toBeVisible();
  await page.screenshot({ path: 'test-results/editor.png' });
  await page.getByRole('button', { name: 'Walk through', exact: true }).click();
  await expect(page.getByText("You're home.")).toBeVisible();
  await page.keyboard.press('w');
  await page.keyboard.press('Escape');
  await expect(page.getByText("You're home.")).toHaveCount(0);
  await page.getByRole('button', { name: 'See the exterior' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export 3D image' }).click();
  expect((await dl).suggestedFilename()).toContain('exterior.png');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/exterior.png' });
});
test('draw, move, resize, undo, redo, and reload preserve geometry', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'My projects', exact: true }).click();
  await page.getByRole('button', { name: 'Start from scratch' }).click();
  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  await page.getByRole('button', { name: 'Draw room', exact: true }).click();
  const plan = page.getByTestId('floor-plan');
  const b = (await plan.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('shape-room')).toHaveCount(1);
  const before = await page.getByTestId('shape-room').locator('rect').first().getAttribute('x');
  const room = page.getByTestId('shape-room');
  const rb = (await room.boundingBox())!;
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width / 2 + 50, rb.y + rb.height / 2, { steps: 5 });
  await page.mouse.up();
  const after = await room.locator('rect').first().getAttribute('x');
  expect(after).not.toEqual(before);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await room.locator('rect').first().getAttribute('x')).toEqual(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await room.locator('rect').first().getAttribute('x')).toEqual(after);
  await page.getByLabel('Width (ft)', { exact: true }).fill('20');
  await page.getByLabel('Width (ft)', { exact: true }).press('Enter');
  await expect(page.getByLabel('Width (ft)', { exact: true })).toHaveValue('20');
  await expect(page.getByText('All changes saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('shape-room')).toHaveCount(1);
  await page.getByTestId('shape-room').click();
  await expect(page.getByLabel('Width (ft)', { exact: true })).toHaveValue('20');
});
test('floor copies preserve doors and basement edits stay separate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add floor or basement' }).click();
  await page.getByLabel('Floor name (optional)').fill('Upstairs');
  await page.getByLabel('Copy rooms and furniture').check();
  await page.getByRole('button', { name: 'Create floor' }).click();
  await expect(page.getByLabel('Active floor', { exact: true })).toHaveValue('1');
  await expect(page.getByTestId('shape-room')).toHaveCount(7);
  await page.getByRole('button', { name: 'Add floor or basement' }).click();
  await page.getByRole('button', { name: 'Basement', exact: true }).click();
  await page.getByRole('button', { name: 'Create floor' }).click();
  await expect(page.getByLabel('Active floor', { exact: true })).toHaveValue('-1');
  await expect(page.getByTestId('shape-room')).toHaveCount(0);
  await page.getByLabel('Active floor', { exact: true }).selectOption('0');
  await expect(page.getByTestId('shape-room')).toHaveCount(7);
});
test('exports a valid portable project and imports it without replacing original', async ({
  page,
}) => {
  await page.goto('/');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project', exact: true }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/\.hearth$/);
  const path = (await download.path())!;
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.getByText('Project opened as a new local copy.')).toBeVisible();
  await page.getByRole('button', { name: 'My projects', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(2);
});
test('bad project files do not erase the current design', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.hearth',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":1}'),
  });
  await expect(page.getByText('Unsupported or damaged project file.')).toBeVisible();
  await expect(page.getByTestId('shape-room')).toHaveCount(7);
});
test('desktop layout stays within viewport at minimum size', async ({ page }) => {
  await page.setViewportSize({ width: 1050, height: 720 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1050);
  expect(await page.locator('.canvases').evaluate((e) => e.clientHeight)).toBeGreaterThan(250);
  await page.screenshot({ path: 'test-results/minimum-window.png' });
});

test('wall openings, drag resize, and keyboard shape movement work together', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  const room = page.getByTestId('shape-room').first();
  const rect = room.locator('rect').first();
  const b = (await rect.boundingBox())!;
  await page.getByRole('button', { name: 'Window Click a wall' }).click();
  await page.mouse.click(b.x + b.width * 0.8, b.y);
  await expect(page.locator('.opening-row')).toHaveCount(5);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const handle = page.getByTestId('resize-handle');
  const hb = (await handle.boundingBox())!;
  const widthBefore = Number(await rect.getAttribute('width'));
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 30, hb.y + hb.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  expect(Number(await rect.getAttribute('width'))).toBeGreaterThan(widthBefore);
  const xBefore = Number(await rect.getAttribute('x'));
  await room.press('ArrowRight');
  expect(Number(await rect.getAttribute('x'))).toBeCloseTo(xBefore + 0.25);
  await page.getByRole('button', { name: 'Delete selected shape' }).click();
  await expect(page.getByTestId('shape-room')).toHaveCount(6);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('shape-room')).toHaveCount(7);
});

test('dialogs keep keyboard focus inside and restore it on escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Help and shortcuts' }).click();
  await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: "Let's make room" })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Help and shortcuts' })).toBeFocused();
});
