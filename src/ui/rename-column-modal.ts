import { App, Modal, Setting } from "obsidian";

export interface RenameColumnModalOptions {
  app: App;
  currentName: string;
  onSave: (newName: string) => void | Promise<void>;
}

export class RenameColumnModal extends Modal {
  private options: RenameColumnModalOptions;
  private nameInputEl?: HTMLInputElement;

  constructor(options: RenameColumnModalOptions) {
    super(options.app);
    this.options = options;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ms-modal-rename-column");

    this.titleEl.setText("Rename Property");

    const nameSection = contentEl.createDiv({ cls: "ms-modal-name-section" });
    const nameHeader = nameSection.createDiv({ cls: "ms-modal-section-header" });
    nameHeader.createDiv({ cls: "ms-modal-section-title", text: "Property Name" });
    nameHeader.createDiv({
      cls: "ms-modal-section-desc",
      text: "Enter a new name for this column / property",
    });

    const nameInputWrap = nameSection.createDiv({ cls: "ms-modal-name-input-wrap" });
    const nameInput = nameInputWrap.createEl("input", {
      type: "text",
      cls: "ms-modal-name-input",
      placeholder: "e.g. Status, Priority, Tags...",
      value: this.options.currentName,
    });
    this.nameInputEl = nameInput;

    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      }
    });

    setTimeout(() => {
      nameInput.focus();
      nameInput.select();
    }, 50);

    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => this.submit());
      })
      .addButton((btn) => {
        btn
          .setButtonText("Cancel")
          .onClick(() => this.close());
      });
  }

  private submit(): void {
    const raw = this.nameInputEl ? this.nameInputEl.value : "";
    const trimmed = raw.trim();
    if (!trimmed) return;

    this.options.onSave(trimmed);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
