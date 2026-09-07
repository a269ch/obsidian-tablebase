import { describe, it, expect, vi } from "vitest";
import { Command, Editor, MarkdownView, Plugin } from "obsidian";
import { CommandService } from "../src/services/command-service";

describe("CommandService", () => {
  const createMockPlugin = () => {
    const commands: Command[] = [];
    const plugin = {
      addCommand: vi.fn((cmd: Command) => {
        commands.push(cmd);
      }),
    } as unknown as Plugin;

    return { plugin, commands };
  };

  const createMockEditor = (lines: string[], cursorLine: number = 0) => {
    let textLines = [...lines];
    let replacedSelection = "";

    const editor = {
      getCursor: vi.fn(() => ({ line: cursorLine, ch: 0 })),
      getLine: vi.fn((lineIdx: number) => textLines[lineIdx] || ""),
      lineCount: vi.fn(() => textLines.length),
      replaceSelection: vi.fn((text: string) => {
        replacedSelection = text;
      }),
      replaceRange: vi.fn((replacement: string, from: { line: number }, to: { line: number }) => {
        textLines.splice(from.line, to.line - from.line + 1, replacement);
      }),
      getReplacedSelection: () => replacedSelection,
      getTextLines: () => textLines,
    } as unknown as Editor & {
      getReplacedSelection: () => string;
      getTextLines: () => string[];
    };

    return editor;
  };

  it("should register insert-table and convert-table commands", () => {
    const { plugin, commands } = createMockPlugin();
    const service = new CommandService(plugin);

    service.registerCommands();

    expect(plugin.addCommand).toHaveBeenCalledTimes(2);
    expect(commands.some((c) => c.id === "insert-table")).toBe(true);
    expect(commands.some((c) => c.id === "convert-table-to-codeblock")).toBe(true);
  });

  it("should insert TableBase template table on insert-table command", () => {
    const { plugin, commands } = createMockPlugin();
    const service = new CommandService(plugin);
    service.registerCommands();

    const insertCmd = commands.find((c) => c.id === "insert-table");
    const editor = createMockEditor([""]);
    insertCmd?.editorCallback?.(editor, {} as MarkdownView);

    expect(editor.getReplacedSelection()).toContain("```table");
    expect(editor.getReplacedSelection()).toContain("| Task | Status [select] |");
  });

  it("should convert existing table lines into a TableBase code block", () => {
    const { plugin, commands } = createMockPlugin();
    const service = new CommandService(plugin);
    service.registerCommands();

    const convertCmd = commands.find((c) => c.id === "convert-table-to-codeblock");
    const mockView = {} as MarkdownView;

    const nonTableEditor = createMockEditor(["Some random text"], 0);
    const checkResult = convertCmd?.editorCheckCallback?.(true, nonTableEditor, mockView);
    expect(checkResult).toBe(false);

    const tableEditor = createMockEditor([
      "# Header",
      "| Col1 | Col2 |",
      "| --- | --- |",
      "| Val1 | Val2 |",
      "Footer text",
    ], 2);

    const checkTableResult = convertCmd?.editorCheckCallback?.(true, tableEditor, mockView);
    expect(checkTableResult).toBe(true);

    convertCmd?.editorCheckCallback?.(false, tableEditor, mockView);
    const resultLines = tableEditor.getTextLines();
    expect(resultLines.join("\n")).toContain("```table\n| Col1 | Col2 |\n| --- | --- |\n| Val1 | Val2 |\n```");
  });
});
