const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'hearth-desktop-test-'));
  const executablePath = process.argv[2];
  const app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [...(executablePath ? [] : ['.']), `--user-data-dir=${temporary}`],
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('button', { name: "Let's make room" }).click();
    await page.locator('canvas').waitFor();
    assert.equal(await page.evaluate(() => typeof window.hearth.save), 'function');
    const projectFile = path.join(temporary, 'native-save.hearth');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, projectFile);
    await page.getByRole('button', { name: 'Export project', exact: true }).click();
    await page.getByText('Project file saved. Keep designing.').waitFor();
    const saved = JSON.parse(await fs.readFile(projectFile, 'utf8'));
    assert.equal(saved.name, 'The Sunday House');
    assert.equal(saved.version, 1);
    assert.equal(saved.items.filter((i) => i.kind === 'room').length, 7);
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, projectFile);
    await page.getByRole('button', { name: 'My projects', exact: true }).click();
    await page.getByRole('button', { name: 'Open project file' }).click();
    await page.getByText('Project opened as a new local copy.').waitFor();
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await fs.mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/desktop-editor.png' });
    await page.getByRole('button', { name: 'Walk through', exact: true }).click();
    await page.getByText("You're home.").waitFor();
    await page.keyboard.press('Escape');
    await page.getByTestId('floor-plan').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'Desktop smoke passed: packaged rendering, native save/open bridge, project validation, walkthrough return, no renderer errors.',
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
