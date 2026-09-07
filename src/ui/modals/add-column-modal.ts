import { App, Modal, Setting } from "obsidian";
import { ColumnType, DateFormatOption } from "../../types";
import { appendIcon } from "../../utils/dom";
import { COLUMN_TYPE_DEFINITIONS, ICON_CHECK } from "../icons";

export interface AddColumnModalOptions {
  app: App;
  onSave: (name: string, type: ColumnType, dateFormat?: DateFormatOption) => void;
  onClose?: () => void;
  initialType?: ColumnType;
  initialDateFormat?: DateFormatOption;
}

export class AddColumnModal extends Modal {
  private options: AddColumnModalOptions;
  private columnType: ColumnType;
  private dateFormat?: DateFormatOption;
  private nameInputEl?: HTMLInputElement;
  private nameErrorEl?: HTMLElement;

  constructor(options: AddColumnModalOptions) {
    super(options.app);
    this.options = options;
    this.columnType = options.initialType ?? "text";
    this.dateFormat = options.initialDateFormat ?? "YYYY-MM-DD";
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ms-modal-add-column");

    this.titleEl.setText("Add New Property / Column");

    const nameSection = contentEl.createDiv({ cls: "ms-modal-name-section" });
    const nameHeader = nameSection.createDiv({ cls: "ms-modal-section-header" });
    nameHeader.createDiv({ cls: "ms-modal-section-title", text: "Property Name" });
    nameHeader.createDiv({
      cls: "ms-modal-section-desc",
      text: "Enter a name for the new column",
    });

    const nameInputWrap = nameSection.createDiv({ cls: "ms-modal-name-input-wrap" });
    const nameInput = nameInputWrap.createEl("input", {
      type: "text",
      cls: "ms-modal-name-input",
      placeholder: "e.g. Status, Priority, Tags...",
    });
    this.nameInputEl = nameInput;

    this.nameErrorEl = nameSection.createDiv({
      cls: "ms-modal-name-error",
      text: "Enter a property name to continue.",
    });
    this.nameErrorEl.hidden = true;

    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      }
    });
    nameInput.addEventListener("input", () => this.clearNameError());
    window.setTimeout(() => nameInput.focus(), 50);

    const typeSection = contentEl.createDiv({ cls: "ms-modal-type-section" });
    const typeHeader = typeSection.createDiv({ cls: "ms-modal-section-header" });
    typeHeader.createDiv({ cls: "ms-modal-section-title", text: "Property Type" });
    typeHeader.createDiv({
      cls: "ms-modal-section-desc",
      text: "Select data type for this column",
    });

    const typesContainer = typeSection.createDiv({ cls: "ms-add-col-types-grid" });
    const typeCards: HTMLElement[] = [];

    for (const definition of COLUMN_TYPE_DEFINITIONS) {
      const isSelected = this.columnType === definition.type;
      const card = typesContainer.createDiv({
        cls: `ms-add-col-type-card ${isSelected ? "is-selected" : ""}`,
      });
      typeCards.push(card);

      appendIcon(card.createDiv({ cls: "ms-type-card-icon" }), definition.icon);

      const infoWrap = card.createDiv({ cls: "ms-type-card-info" });
      infoWrap.createDiv({ cls: "ms-type-card-label", text: definition.label });
      infoWrap.createDiv({ cls: "ms-type-card-desc", text: definition.desc });

      appendIcon(card.createDiv({ cls: "ms-type-card-check" }), ICON_CHECK);

      card.addEventListener("click", () => {
        this.columnType = definition.type;
        typeCards.forEach((el) => el.classList.remove("is-selected"));
        card.classList.add("is-selected");
      });
    }

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText("Create").setCta().onClick(() => this.submit()))
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
  }

  private clearNameError(): void {
    if (this.nameErrorEl) {
      this.nameErrorEl.hidden = true;
    }
    this.nameInputEl?.classList.remove("is-invalid");
  }

  private showNameError(): void {
    if (this.nameErrorEl) {
      this.nameErrorEl.hidden = false;
    }
    this.nameInputEl?.classList.add("is-invalid");
    this.nameInputEl?.focus();
  }

  private submit(): void {
    const name = (this.nameInputEl?.value ?? "").trim();
    if (!name) {
      this.showNameError();
      return;
    }

    this.options.onSave(
      name,
      this.columnType,
      this.columnType === "date"
        ? this.dateFormat ?? this.options.initialDateFormat ?? "YYYY-MM-DD"
        : undefined
    );
    this.close();
  }

  override onClose(): void {
    this.contentEl.empty();
    this.options.onClose?.();
  }
}
