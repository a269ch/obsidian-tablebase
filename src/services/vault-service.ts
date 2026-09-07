import { App, TFile } from "obsidian";

export class VaultService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  public getFileByPath(filePath: string): TFile | null {
    if (!filePath) return null;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    return file instanceof TFile ? file : null;
  }

  public getActiveFile(): TFile | null {
    return this.app.workspace.getActiveFile();
  }

  public async readFile(filePath: string): Promise<string | null> {
    const file = this.getFileByPath(filePath);
    if (!file) return null;
    return this.app.vault.read(file);
  }

  public async modifyFile(
    filePath: string,
    transform: (content: string) => string
  ): Promise<boolean> {
    const file = this.getFileByPath(filePath);
    if (!file) return false;

    try {
      await this.app.vault.process(file, transform);
      return true;
    } catch {
      try {
        const content = await this.app.vault.read(file);
        const updated = transform(content);
        await this.app.vault.modify(file, updated);
        return true;
      } catch {
        return false;
      }
    }
  }
}
