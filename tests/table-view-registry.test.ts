import { describe, it, expect, vi } from "vitest";
import { TableViewRegistry } from "../src/services/table-view-registry";

describe("TableViewRegistry", () => {
  it("should dispose every registered view", () => {
    const registry = new TableViewRegistry();
    const first = { dispose: vi.fn() };
    const second = { dispose: vi.fn() };

    registry.register(first);
    registry.register(second);
    expect(registry.size).toBe(2);

    registry.dispose();

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);
  });

  it("should not dispose views that unregistered themselves", () => {
    const registry = new TableViewRegistry();
    const view = { dispose: vi.fn() };

    registry.register(view);
    registry.unregister(view);
    registry.dispose();

    expect(view.dispose).not.toHaveBeenCalled();
    expect(registry.size).toBe(0);
  });

  it("should keep disposing after a view throws", () => {
    const registry = new TableViewRegistry();
    const failing = {
      dispose: vi.fn(() => {
        throw new Error("dispose failed");
      }),
    };
    const survivor = { dispose: vi.fn() };

    registry.register(failing);
    registry.register(survivor);

    expect(() => registry.dispose()).not.toThrow();
    expect(survivor.dispose).toHaveBeenCalledTimes(1);
  });

  it("should register a view only once", () => {
    const registry = new TableViewRegistry();
    const view = { dispose: vi.fn() };

    registry.register(view);
    registry.register(view);

    expect(registry.size).toBe(1);
    registry.dispose();
    expect(view.dispose).toHaveBeenCalledTimes(1);
  });
});
