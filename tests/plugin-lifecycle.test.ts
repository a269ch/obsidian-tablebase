import { describe, it, expect, vi } from "vitest";
import { App } from "obsidian";
import TableBasePlugin from "../src/main";

describe("TableBasePlugin lifecycle", () => {
  it("should initialize all services on onload and clean up on onunload", async () => {
    const mockApp = {
      vault: {},
      workspace: {},
    } as unknown as App;

    const mockManifest = {
      id: "obsidian-tablebase",
      name: "TableBase",
      version: "0.1.0",
      minAppVersion: "1.0.0",
      author: "Aleksei",
      description: "TableBase plugin",
    };

    const plugin = new TableBasePlugin(mockApp, mockManifest);
    const postProcessorSpy = vi.spyOn(plugin, "registerMarkdownPostProcessor");
    const codeBlockSpy = vi.spyOn(plugin, "registerMarkdownCodeBlockProcessor");
    const settingTabSpy = vi.spyOn(plugin, "addSettingTab");
    const commandSpy = vi.spyOn(plugin, "addCommand");

    await plugin.onload();

    expect(postProcessorSpy).toHaveBeenCalled();
    expect(codeBlockSpy).toHaveBeenCalled();
    expect(settingTabSpy).toHaveBeenCalled();
    expect(commandSpy).toHaveBeenCalled();

    expect(() => plugin.onunload()).not.toThrow();
  });
});
