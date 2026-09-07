import { describe, it, expect, vi } from "vitest";
import {
  bindEvent,
  debounce,
  DisposableRegistry,
  toDisposable,
} from "../src/utils/lifecycle";

describe("toDisposable", () => {
  it("should run the callback only once", () => {
    const spy = vi.fn();
    const disposable = toDisposable(spy);

    disposable.dispose();
    disposable.dispose();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("bindEvent", () => {
  it("should attach a listener and detach it on dispose", () => {
    const target = new EventTarget();
    const handler = vi.fn();

    const disposable = bindEvent(
      target as unknown as HTMLElement,
      "click",
      handler
    );

    target.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);

    disposable.dispose();
    target.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("DisposableRegistry", () => {
  it("should dispose every registered item exactly once", () => {
    const registry = new DisposableRegistry();
    const first = vi.fn();
    const second = vi.fn();

    registry.addFn(first);
    registry.addFn(second);
    expect(registry.size).toBe(2);

    registry.dispose();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);
    expect(registry.isDisposed).toBe(true);
  });

  it("should immediately dispose items added after disposal", () => {
    const registry = new DisposableRegistry();
    registry.dispose();

    const late = vi.fn();
    registry.addFn(late);

    expect(late).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);
  });

  it("should keep disposing remaining items when one throws", () => {
    const registry = new DisposableRegistry();
    const survivor = vi.fn();

    registry.addFn(() => {
      throw new Error("boom");
    });
    registry.addFn(survivor);

    expect(() => registry.dispose()).not.toThrow();
    expect(survivor).toHaveBeenCalledTimes(1);
  });

  it("should detach listeners registered through listen()", () => {
    const registry = new DisposableRegistry();
    const target = new EventTarget();
    const handler = vi.fn();

    registry.listen(target as unknown as HTMLElement, "click", handler);
    target.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);

    registry.dispose();
    target.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should cancel pending timeouts on dispose", async () => {
    vi.useFakeTimers();
    const registry = new DisposableRegistry();
    const handler = vi.fn();

    registry.timeout(handler, 50);
    registry.dispose();
    vi.advanceTimersByTime(100);

    expect(handler).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("should drop a fired timeout from the registry", () => {
    vi.useFakeTimers();
    const registry = new DisposableRegistry();
    const handler = vi.fn();

    registry.timeout(handler, 10);
    expect(registry.size).toBe(1);

    vi.advanceTimersByTime(20);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);
    vi.useRealTimers();
  });

  it("should support disposeAll without sealing the registry", () => {
    const registry = new DisposableRegistry();
    const first = vi.fn();

    registry.addFn(first);
    registry.disposeAll();
    expect(first).toHaveBeenCalledTimes(1);
    expect(registry.isDisposed).toBe(false);

    const second = vi.fn();
    registry.addFn(second);
    expect(registry.size).toBe(1);
    expect(second).not.toHaveBeenCalled();
  });
});

describe("debounce", () => {
  it("should invoke the callback once for a burst of calls", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced();
    debounced();
    debounced();
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("should pass through the latest arguments", () => {
    vi.useFakeTimers();
    const spy = vi.fn<(value: string) => void>();
    const debounced = debounce(spy, 50);

    debounced("first");
    debounced("second");
    vi.advanceTimersByTime(60);

    expect(spy).toHaveBeenCalledWith("second");
    vi.useRealTimers();
  });

  it("should cancel a pending invocation on dispose", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 50);

    debounced();
    debounced.dispose();
    vi.advanceTimersByTime(100);

    expect(spy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
