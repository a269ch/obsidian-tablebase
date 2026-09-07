import { describe, it, expect, vi } from "vitest";
import { App, TFile } from "obsidian";
import { VaultService } from "../src/services/vault-service";

describe("VaultService", () => {
  const createMockApp = (options: {
    files?: Record<string, string>;
    processFails?: boolean;
  } = {}) => {
    const files = options.files || {};
    const mockTFile = (path: string) => {
      const f = new TFile();
      f.path = path;
      return f;
    };

    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => {
        if (path in files) {
          return mockTFile(path);
        }
        return null;
      }),
      read: vi.fn(async (file: TFile) => files[file.path] || ""),
      modify: vi.fn(async (file: TFile, content: string) => {
        files[file.path] = content;
      }),
      process: vi.fn(async (file: TFile, transform: (content: string) => string) => {
        if (options.processFails) {
          throw new Error("Process lock unavailable");
        }
        files[file.path] = transform(files[file.path] || "");
        return files[file.path];
      }),
    };

    const workspace = {
      getActiveFile: vi.fn(() => (Object.keys(files)[0] ? mockTFile(Object.keys(files)[0]) : null)),
    };

    return {
      app: { vault, workspace } as unknown as App,
      files,
      vault,
    };
  };

  it("should get existing TFile by path", () => {
    const { app } = createMockApp({ files: { "notes/todo.md": "# Note" } });
    const service = new VaultService(app);

    const file = service.getFileByPath("notes/todo.md");
    expect(file).toBeInstanceOf(TFile);
    expect(file?.path).toBe("notes/todo.md");

    expect(service.getFileByPath("nonexistent.md")).toBeNull();
    expect(service.getFileByPath("")).toBeNull();
  });

  it("should read content of a file", async () => {
    const { app } = createMockApp({ files: { "test.md": "Hello World" } });
    const service = new VaultService(app);

    const content = await service.readFile("test.md");
    expect(content).toBe("Hello World");

    const nonExistent = await service.readFile("none.md");
    expect(nonExistent).toBeNull();
  });

  it("should modify file using vault.process", async () => {
    const { app, files, vault } = createMockApp({ files: { "test.md": "Hello" } });
    const service = new VaultService(app);

    const success = await service.modifyFile("test.md", (c) => c + " World");
    expect(success).toBe(true);
    expect(files["test.md"]).toBe("Hello World");
    expect(vault.process).toHaveBeenCalledOnce();
  });

  it("should fallback to read + modify when process throws an exception", async () => {
    const { app, files, vault } = createMockApp({
      files: { "test.md": "Hello" },
      processFails: true,
    });
    const service = new VaultService(app);

    const success = await service.modifyFile("test.md", (c) => c + " Fallback");
    expect(success).toBe(true);
    expect(files["test.md"]).toBe("Hello Fallback");
    expect(vault.process).toHaveBeenCalledOnce();
    expect(vault.read).toHaveBeenCalledOnce();
    expect(vault.modify).toHaveBeenCalledOnce();
  });

  it("should return false when trying to modify nonexistent file", async () => {
    const { app } = createMockApp();
    const service = new VaultService(app);

    const success = await service.modifyFile("missing.md", (c) => c);
    expect(success).toBe(false);
  });
});
