import { test, expect, type Page } from '@playwright/test';
// Fresh browsers see the welcome guide first.
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: "Let's make room" }).click();
}
test('starter renders cleanly, walkthrough exits, exterior image exports', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
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
  await open(page);
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
  await expect(page.getByLabel('Width (ft)', { exact: true })).toHaveValue('20′');
  await expect(page.getByText('All changes saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('shape-room')).toHaveCount(1);
  // Near a corner: the room's name in the middle picks the room too, but sits on top of it.
  await page.getByTestId('shape-room').click({ position: { x: 12, y: 12 } });
  await expect(page.getByLabel('Width (ft)', { exact: true })).toHaveValue('20′');
});
test('floor copies preserve doors and basement edits stay separate', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Add floor or basement' }).click();
  await page.getByLabel('Floor name (optional)').fill('Upstairs');
  await page.getByLabel('Copy rooms and furniture').check();
  await page.getByRole('dialog').getByRole('button', { name: 'None', exact: true }).click();
  await page.getByRole('button', { name: 'Create floor' }).click();
  await expect(page.getByLabel('Active floor', { exact: true })).toHaveValue('2');
  await expect(page.getByTestId('shape-room')).toHaveCount(7);
  await page.getByRole('button', { name: 'Add floor or basement' }).click();
  await page.getByRole('button', { name: 'Basement', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Straight', exact: true }).click();
  await page.getByRole('button', { name: 'Create floor' }).click();
  await expect(page.getByLabel('Active floor', { exact: true })).toHaveValue('-1');
  // A new basement starts with the stairs down and a hall around them.
  await expect(page.getByTestId('shape-room')).toHaveCount(1);
  await expect(page.getByTestId('shape-stairs')).toHaveCount(1);
  await page.getByLabel('Active floor', { exact: true }).selectOption('0');
  await expect(page.getByTestId('shape-room')).toHaveCount(7);
});
test('exports a valid portable project and imports it without replacing original', async ({
  page,
}) => {
  await open(page);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project', exact: true }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/\.hearth$/);
  const path = (await download.path())!;
  await page.locator('input[type=file]').setInputFiles(path);
  // A second project of the same name is told apart by a number.
  await expect(page.getByText('Opened “The Sunday House (2)” as a new project')).toBeVisible();
  await page.getByRole('button', { name: 'My projects', exact: true }).click();
  // The Sunday House and Arthur's House come with a fresh install; the import makes three.
  await expect(page.locator('.project-card')).toHaveCount(3);
  await expect(page.locator('.project-card', { hasText: "Arthur's House" })).toHaveCount(1);
});
test('bad project files do not erase the current design', async ({ page }) => {
  await open(page);
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
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1050);
  expect(await page.locator('.canvases').evaluate((e) => e.clientHeight)).toBeGreaterThan(250);
  await page.screenshot({ path: 'test-results/minimum-window.png' });
});

test('wall openings, drag resize, and keyboard shape movement work together', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  const room = page.getByTestId('shape-room').first();
  const rect = room.locator('rect').first();
  const b = (await rect.boundingBox())!;
  await page.getByRole('button', { name: /^Window/ }).click();
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
  await open(page);
  await page.getByRole('button', { name: 'Help and shortcuts' }).click();
  // The dialog itself takes focus, so no button is highlighted before a key is pressed.
  await expect(page.getByRole('dialog')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: "Let's make room" })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Help and shortcuts' })).toBeFocused();
});

test('stairs rotate, change style, and lead up to the next floor', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  await page.getByRole('button', { name: /^Spiral/ }).click();
  const plan = page.getByTestId('floor-plan');
  const b = (await plan.boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.15, b.y + b.height * 0.15);
  await expect(page.getByText('Joins')).toContainText('Ground floor');
  await expect(page.getByText('Joins')).toContainText('Upstairs');
  const width = page.getByLabel('Width (ft)', { exact: true });
  await page
    .getByRole('button', { name: /^Switchback/ })
    .last()
    .click();
  const before = await width.inputValue();
  await page.keyboard.press('e');
  await expect(width).not.toHaveValue(before);
  await page.getByRole('button', { name: 'Goes down' }).click();
  await expect(page.getByText("There's no floor below yet.")).toBeVisible();
  await page.getByRole('button', { name: 'Add a basement here' }).click();
  await expect(page.getByLabel('Active floor', { exact: true })).toHaveValue('-1');
  await expect(page.getByTestId('shape-stairs')).toHaveCount(1);
});

test('an L-shaped run flips left for right, and the walls take a material', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  await page.getByRole('button', { name: /^L-shaped/ }).click();
  const plan = page.getByTestId('floor-plan');
  const b = (await plan.boundingBox())!;
  await page.mouse.click(b.x + b.width * 0.2, b.y + b.height * 0.2);
  // The dashed arrow on the plan runs from the bottom step to the top. The starter house
  // already has a straight run, so the L-shaped one we just laid is the last.
  const arrow = page.locator('[data-testid="shape-stairs"] path[marker-end]').last();
  const before = await arrow.getAttribute('d');
  await page.getByRole('button', { name: 'Flip the stairs' }).click();
  await expect.poll(() => arrow.getAttribute('d')).not.toBe(before);
  await page.getByRole('button', { name: 'Flip the stairs' }).click();
  await expect.poll(() => arrow.getAttribute('d')).toBe(before);
  // Four turns come back to where they started, but handed the other way.
  for (let n = 0; n < 4; n++) await page.keyboard.press('e');
  await expect.poll(() => arrow.getAttribute('d')).not.toBe(before);
  for (let n = 0; n < 4; n++) await page.keyboard.press('e');
  await expect.poll(() => arrow.getAttribute('d')).toBe(before);

  await page.keyboard.press('Escape');
  const brick = page.getByRole('button', { name: 'Brick', exact: true });
  await brick.click();
  await expect(brick).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'See the exterior' }).click();
  await expect(page.locator('canvas')).toBeVisible();
});

test('the catalog can be searched across every tab', async ({ page }) => {
  await open(page);
  const search = page.getByLabel('Search the catalog');
  await search.fill('four-poster');
  await expect(page.getByRole('button', { name: /Four-poster bed/ })).toBeVisible();
  await search.fill('trampoline');
  await expect(page.getByRole('button', { name: /Trampoline/ })).toBeVisible();
  await search.fill('zzzz');
  await expect(page.getByText('NOTHING FOUND')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByText('SPACES')).toBeVisible();
});

test("Arthur's House opens, shows its outside, and can be walked from the street", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.getByRole('button', { name: 'My projects', exact: true }).click();
  await page.getByRole('button', { name: /Tour Arthur/ }).click();
  await expect(page.getByText("Arthur's House").first()).toBeVisible();
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await page.getByRole('button', { name: 'Exterior', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Walk through', exact: true }).click();
  await expect(page.getByText("You're home.")).toBeVisible();
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  await page.getByRole('button', { name: 'Upstairs', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('fits a phone screen, with the panels tucked into drawers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('.library-panel')).toBeHidden();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.library-panel')).toBeVisible();
  await page.locator('.drawer-scrim').click({ position: { x: 370, y: 300 } });
  await expect(page.locator('.library-panel')).toBeHidden();
});
