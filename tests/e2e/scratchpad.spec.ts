import { expect, test, type Page } from "@playwright/test";

const baseURL = process.env.FLOWSTATE_QA_BASE_URL ?? "http://127.0.0.1:3010";
const scratchpadURL = `${baseURL}/clients/local-qa-organization/scratchpad`;
const expectedText = "Alpha revised Beta Gamma";

async function exerciseScratchpad(page: Page) {
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto(scratchpadURL, { waitUntil: "networkidle" });
  const editor = page.locator('[data-scratchpad-editor]');
  await expect(editor).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved");

  await editor.fill("Alpha Beta Gamma");
  await editor.press("Control+Home");
  await editor.press("ArrowRight");
  await editor.press("ArrowRight");
  await editor.press("ArrowRight");
  await editor.press("ArrowRight");
  await editor.press("ArrowRight");
  await editor.press("ArrowRight");
  await editor.press("Shift+ArrowRight");
  await editor.press("Shift+ArrowRight");
  await editor.press("Shift+ArrowRight");
  await editor.press("Shift+ArrowRight");
  await editor.type("revised");
  await editor.press("End");
  await editor.press("Backspace");
  await editor.type("a");
  await editor.press("Control+Home");
  for (let index = 0; index < 13; index += 1) await editor.press("ArrowRight");
  await editor.type(" Beta");
  await expect(editor).toHaveText(expectedText);

  // Exercise composition/transcription-style insertion without relying on an IME.
  await editor.evaluate((node, text) => {
    node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    node.textContent = `${node.textContent} ${text}`;
    node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }));
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }, "Transcript");
  await expect(editor).toHaveText(`${expectedText} Transcript`);

  await expect.poll(() => page.getByRole("status").innerText(), { timeout: 10_000 }).toBe("Saved");
  await page.reload({ waitUntil: "networkidle" });
  await expect(editor).toHaveText(`${expectedText} Transcript`);
  await expect(page.getByRole("status")).toHaveText("Saved");
  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
}

test.describe("Scratch Pad stability and persistence", () => {
  test.beforeEach(async ({ browserName }) => {
    if (browserName !== "chromium") test.skip();
  });

  for (const viewport of [
    { name: "desktop", width: 1280, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name} typing, rerender, autosave, and reload persistence`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await exerciseScratchpad(page);
    });
  }
});
