import { MarkdownRenderChild } from "obsidian";
import { TableViewRegistry } from "../services/table-view-registry";
import { Disposable } from "../utils/lifecycle";

export class TableRenderChild extends MarkdownRenderChild {
  private view: Disposable;
  private registry: TableViewRegistry;

  constructor(containerEl: HTMLElement, view: Disposable, registry: TableViewRegistry) {
    super(containerEl);
    this.view = view;
    this.registry = registry;
  }

  override onload(): void {
    this.registry.register(this.view);
  }

  override onunload(): void {
    this.registry.unregister(this.view);
    this.view.dispose();
  }
}
