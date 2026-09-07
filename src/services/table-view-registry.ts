import { Disposable } from "../utils/lifecycle";

export class TableViewRegistry implements Disposable {
  private views: Set<Disposable> = new Set();

  public get size(): number {
    return this.views.size;
  }

  public register(view: Disposable): void {
    this.views.add(view);
  }

  public unregister(view: Disposable): void {
    this.views.delete(view);
  }

  public dispose(): void {
    const snapshot = Array.from(this.views);
    this.views.clear();

    for (const view of snapshot) {
      try {
        view.dispose();
      } catch {
        continue;
      }
    }
  }
}
