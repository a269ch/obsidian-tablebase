import { App, Modal, Setting } from "obsidian";

export interface ConfirmModalOptions {
  app: App;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export class ConfirmModal extends Modal {
  private options: ConfirmModalOptions;
  private confirmed = false;

  constructor(options: ConfirmModalOptions) {
    super(options.app);
    this.options = options;
  }

  override onOpen(): void {
    this.confirmed = false;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ms-modal-confirm");

    this.titleEl.setText(this.options.title);
    contentEl.createDiv({ cls: "ms-modal-confirm-message", text: this.options.message });

    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText(this.options.confirmText ?? "Confirm");
        if (this.options.destructive) {
          const destBtn = btn as unknown as { setDestructive?: () => void };
          if (typeof destBtn.setDestructive === "function") {
            destBtn.setDestructive();
          } else {
            btn.setClass("mod-warning");
          }
        } else {
          btn.setCta();
        }
        btn.onClick(async () => {
          this.confirmed = true;
          this.close();
          await this.options.onConfirm();
        });
      })
      .addButton((btn) =>
        btn.setButtonText(this.options.cancelText ?? "Cancel").onClick(() => this.close())
      );
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  public wasConfirmed(): boolean {
    return this.confirmed;
  }
}

export function confirmAction(options: ConfirmModalOptions): void {
  new ConfirmModal(options).open();
}
