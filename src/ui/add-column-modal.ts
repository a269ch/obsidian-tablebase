import { App, Modal, Setting } from "obsidian";
import { ColumnType, DateFormatOption } from "../types";
import { COLUMN_TYPE_DEFINITIONS, ICON_CHECK } from "./icons";

export interface AddColumnModalOptions {
  app: App;
  onSave: (name: string, type: ColumnType, dateFormat?: DateFormatOption) => void;
  initialType?: ColumnType;
  initialDateFormat?: DateFormatOption;
}

export class AddColumnModal extends Modal {
  private options: AddColumnModalOptions;
  private columnName: string = "";
  private columnType: ColumnType = "text";
  private dateFormat?: DateFormatOption;

  private nameInputEl?: HTMLInputElement;

  constructor(options: AddColumnModalOptions) {
    super(options.app);
    this.options = options;
    if (options.initialType) {
      this.columnType = options.initialType;
    }
    if (options.initialDateFormat) {
      this.dateFormat = options.initialDateFormat;
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ms-modal-add-column");

    this.titleEl.setText("Add New Property / Column");

    const nameSection = contentEl.createDiv({ cls: "ms-modal-name-section" });
    const nameHeader = nameSection.createDiv({ cls: "ms-modal-section-header" });
    nameHeader.createDiv({ cls: "ms-modal-section-title", text: "Property Name" });
    nameHeader.createDiv({ cls: "ms-modal-section-desc", text: "Enter a name for the new column" });

    const nameInputWrap = nameSection.createDiv({ cls: "ms-modal-name-input-wrap" });
    const nameInput = nameInputWrap.createEl("input", {
      type: "text",
      cls: "ms-modal-name-input",
      placeholder: "e.g. Status, Priority, Tags...",
      value: this.columnName,
    });
    this.nameInputEl = nameInput;

    nameInput.addEventListener("input", (e) => {
      this.columnName = (e.target as HTMLInputElement).value;
    });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      }
    });
    setTimeout(() => nameInput.focus(), 50);

    const typeSection = contentEl.createDiv({ cls: "ms-modal-type-section" });
    const typeHeader = typeSection.createDiv({ cls: "ms-modal-section-header" });
    typeHeader.createDiv({ cls: "ms-modal-section-title", text: "Property Type" });
    typeHeader.createDiv({ cls: "ms-modal-section-desc", text: "Select data type for this column" });

    const typesContainer = typeSection.createDiv({ cls: "ms-add-col-types-grid" });
    const typeCards: HTMLElement[] = [];

    COLUMN_TYPE_DEFINITIONS.forEach((pt) => {
      const isSelected = this.columnType === pt.type;
      const card = typesContainer.createDiv({
        cls: `ms-add-col-type-card ${isSelected ? "is-selected" : ""}`,
      });
      typeCards.push(card);

      const iconWrap = card.createDiv({ cls: "ms-type-card-icon" });
      iconWrap.innerHTML = pt.icon;

      const infoWrap = card.createDiv({ cls: "ms-type-card-info" });
      infoWrap.createDiv({ cls: "ms-type-card-label", text: pt.label });
      infoWrap.createDiv({ cls: "ms-type-card-desc", text: pt.desc });

      const checkWrap = card.createDiv({ cls: "ms-type-card-check" });
      checkWrap.innerHTML = ICON_CHECK;

      card.addEventListener("click", () => {
        this.columnType = pt.type;
        typeCards.forEach((c) => c.classList.remove("is-selected"));
        card.classList.add("is-selected");
      });
    });

    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText("Create")
          .setCta()
          .onClick(() => {
            this.submit();
          });
      })
      .addButton((btn) => {
        btn
          .setButtonText("Cancel")
          .onClick(() => {
            this.close();
          });
      });
  }

  private submit() {
    const raw = (this.nameInputEl ? this.nameInputEl.value : this.columnName) || "";
    const name = raw.trim();
    if (!name) {
      return;
    }
    this.options.onSave(
      name,
      this.columnType,
      this.columnType === "date" ? this.dateFormat : undefined
    );
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
