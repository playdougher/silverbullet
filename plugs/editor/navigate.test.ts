import { afterEach, expect, test } from "vitest";
import { clickNavigate } from "./navigate.ts";

const originalSyscall = globalThis.syscall;
afterEach(() => { globalThis.syscall = originalSyscall; });

async function follow(url: string, pages: string[], selected?: string, ctrlKey = false) {
  const calls: { name: string; args: any[] }[] = [];
  globalThis.syscall = async (name: string, ...args: any[]) => {
    calls.push({ name, args });
    switch (name) {
      case "editor.getText": return `[title](${url})`;
      case "editor.getCurrentPage": return "Inbox/source";
      case "markdown.parseMarkdown": return {
        type: "Link", from: 0, to: 200,
        children: [{ type: "URL", from: 8, to: 100,
          children: [{ text: url, from: 8, to: 100 }] }],
      };
      case "space.listPages": return pages.map(name => ({ name }));
      case "editor.filterBox": return selected ? { path: selected } : undefined;
      case "editor.navigate":
      case "editor.flashNotification": return;
      default: throw new Error(`Unexpected syscall: ${name}`);
    }
  };
  await clickNavigate({ page: "Inbox/source", pos: 10, ctrlKey, metaKey: false, altKey: false });
  return calls;
}

for (const target of [
  "20260708T143149--original",
  "Projects/Database/20260708T143149--original",
  "Archive/20260708T143149--renamed",
]) {
  test(`Denote opens full path without rewriting text: ${target}`, async () => {
    const calls = await follow("denote:20260708T143149", [target, "unrelated"]);
    expect(calls.find(c => c.name === "editor.navigate")?.args).toEqual([target, false, false]);
    expect(calls.some(c => c.name === "editor.setText" || c.name === "space.writePage")).toBe(false);
  });
}

test("Denote preserves Ctrl-click new-window flag", async () => {
  const target = "Folder/20260708T143149--target";
  const calls = await follow("denote:20260708T143149", [target], undefined, true);
  expect(calls.find(c => c.name === "editor.navigate")?.args).toEqual([target, false, true]);
});

test("missing ID reports error without navigating", async () => {
  const calls = await follow("denote:20260708T143149", ["Other/20260709T143149--target"]);
  expect(calls.find(c => c.name === "editor.flashNotification")?.args).toEqual(["Denote link not found: 20260708T143149", "error"]);
  expect(calls.some(c => c.name === "editor.navigate")).toBe(false);
});

test("duplicate ID prompts and opens selected full path", async () => {
  const pages = ["A/20260708T143149--one", "B/20260708T143149--two"];
  const calls = await follow("denote:20260708T143149", pages, pages[1]);
  expect(calls.some(c => c.name === "editor.filterBox")).toBe(true);
  expect(calls.find(c => c.name === "editor.navigate")?.args).toEqual([pages[1], false, false]);
});

test("cancelled duplicate picker does not navigate", async () => {
  const calls = await follow("denote:20260708T143149", ["A/20260708T143149--one", "B/20260708T143149--two"]);
  expect(calls.some(c => c.name === "editor.navigate")).toBe(false);
});

test("malformed Denote URI reports error rather than creating a page", async () => {
  const calls = await follow("denote:invalid", []);
  expect(calls.find(c => c.name === "editor.flashNotification")?.args).toEqual(["Invalid Denote link: denote:invalid", "error"]);
  expect(calls.some(c => c.name === "editor.navigate")).toBe(false);
});
