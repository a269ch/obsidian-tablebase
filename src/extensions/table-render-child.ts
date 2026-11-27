import { MarkdownRenderChild } from "obsidian";
import { TableViewRegistry } from "../services/table-view-registry";
import { Disposable } from "../utils/lifecycle";

export class TableRenderChild extends MarkdownRenderChild {
  private view: Disposable;
  private registry: TableViewRegistry;
  private onMount?: () => void;

  constructor(
    containerEl: HTMLElement,
    view: Disposable,
    registry: TableViewRegistry,
    onMount?: () => void
  ) {
    super(containerEl);
    this.view = view;
    this.registry = registry;
    this.onMount = onMount;
  }

  override onload(): void {
    this.registry.register(this.view);
    this.onMount?.();
  }

  override onunload(): void {
    this.registry.unregister(this.view);
    this.view.dispose();
  }
}
