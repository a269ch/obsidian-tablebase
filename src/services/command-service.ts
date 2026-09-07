import { Editor, MarkdownFileInfo, MarkdownView, Plugin } from "obsidian";

const SAMPLE_TABLEBASE_TEMPLATE = `\`\`\`table
| Task | Status [select] | Priority [multi-select] | Due Date [date] | Done [checkbox] |
| --- | --- | --- | --- | --- |
| Plan sprint | In Progress | High, Sprint 1 | 2026-09-15 | [ ] |
| Design mockups | Todo | Medium, Design | 2026-09-20 | [ ] |
| Release v1.0 | Todo | Urgent | 2026-09-30 | [ ] |
\`\`\`
`;

export class CommandService {
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  public registerCommands(): void {
    this.plugin.addCommand({
      id: "insert-table",
      name: "Insert interactive table",
      editorCallback: (editor: Editor) => {
        editor.replaceSelection(SAMPLE_TABLEBASE_TEMPLATE);
      },
    });

    this.plugin.addCommand({
      id: "convert-table-to-codeblock",
      name: "Convert table under cursor to code block",
      editorCheckCallback: (checking: boolean, editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        if (!ctx) return false;
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const isTableLine = line.trim().startsWith("|");

        if (checking) {
          return isTableLine;
        }

        if (isTableLine) {
          this.wrapCurrentTableAsCodeBlock(editor, cursor.line);
        }
        return true;
      },
    });
  }

  private wrapCurrentTableAsCodeBlock(editor: Editor, cursorLine: number): void {
    let startLine = cursorLine;
    while (startLine > 0 && editor.getLine(startLine - 1).trim().startsWith("|")) {
      startLine--;
    }

    let endLine = cursorLine;
    const totalLines = editor.lineCount();
    while (endLine < totalLines - 1 && editor.getLine(endLine + 1).trim().startsWith("|")) {
      endLine++;
    }

    const tableLines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      tableLines.push(editor.getLine(i));
    }

    const wrapped = `\`\`\`table\n${tableLines.join("\n")}\n\`\`\``;
    editor.replaceRange(
      wrapped,
      { line: startLine, ch: 0 },
      { line: endLine, ch: editor.getLine(endLine).length }
    );
  }
}
