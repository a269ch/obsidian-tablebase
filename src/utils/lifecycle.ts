export interface Disposable {
  dispose(): void;
}

type TimerHandle = number;

type TargetEventMap<T> = T extends Window
  ? WindowEventMap
  : T extends Document
  ? DocumentEventMap
  : HTMLElementEventMap;

export function bindEvent<T extends EventTarget, K extends keyof TargetEventMap<T> & string>(
  target: T,
  type: K,
  handler: (event: TargetEventMap<T>[K]) => void,
  options?: boolean | AddEventListenerOptions
): Disposable {
  const listener = handler as EventListener;
  target.addEventListener(type, listener, options);
  return {
    dispose: (): void => {
      target.removeEventListener(type, listener, options);
    },
  };
}

export function toDisposable(fn: () => void): Disposable {
  let done = false;
  return {
    dispose: (): void => {
      if (done) return;
      done = true;
      fn();
    },
  };
}

export class DisposableRegistry implements Disposable {
  private items: Set<Disposable> = new Set();
  private disposed = false;

  public get size(): number {
    return this.items.size;
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public add<T extends Disposable>(item: T): T {
    if (this.disposed) {
      item.dispose();
      return item;
    }
    this.items.add(item);
    return item;
  }

  public addFn(fn: () => void): Disposable {
    return this.add(toDisposable(fn));
  }

  public listen<T extends EventTarget, K extends keyof TargetEventMap<T> & string>(
    target: T,
    type: K,
    handler: (event: TargetEventMap<T>[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): Disposable {
    return this.add(bindEvent(target, type, handler, options));
  }

  public timeout(handler: () => void, delayMs: number): Disposable {
    let id: TimerHandle;
    const entry = toDisposable(() => window.clearTimeout(id));
    id = window.setTimeout(() => {
      this.items.delete(entry);
      handler();
    }, delayMs);
    return this.add(entry);
  }

  public animationFrame(handler: () => void): Disposable {
    let id = 0;
    const entry = toDisposable(() => window.cancelAnimationFrame(id));
    id = window.requestAnimationFrame(() => {
      this.items.delete(entry);
      handler();
    });
    return this.add(entry);
  }

  public remove(item: Disposable): void {
    this.items.delete(item);
  }

  public disposeAll(): void {
    const snapshot = Array.from(this.items);
    this.items.clear();
    for (const item of snapshot) {
      try {
        item.dispose();
      } catch {
        continue;
      }
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeAll();
  }
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number
): ((...args: A) => void) & Disposable {
  let timer: TimerHandle | null = null;

  const invoke = (...args: A): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };

  invoke.dispose = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  return invoke;
}
