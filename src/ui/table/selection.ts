export interface FocusedCell {
  row: number;
  col: number;
}

export type SelectionState =
  | { kind: "none" }
  | { kind: "cell"; row: number; col: number }
  | { kind: "row"; row: number }
  | { kind: "column"; col: number };

const FOCUS_CLASS_SELECTOR =
  ".ms-db-td.is-focused, .ms-db-td.is-col-focused, .ms-db-th.is-col-focused, .ms-db-tr.is-row-focused";

export class SelectionModel {
  private state: SelectionState = { kind: "none" };

  public get current(): SelectionState {
    return this.state;
  }

  public getFocusedCell(): FocusedCell | null {
    return this.state.kind === "cell"
      ? { row: this.state.row, col: this.state.col }
      : null;
  }

  public focusCell(row: number, col: number): void {
    this.state = { kind: "cell", row, col };
  }

  public focusRow(row: number): void {
    this.state = { kind: "row", row };
  }

  public focusColumn(col: number): void {
    this.state = { kind: "column", col };
  }

  public clear(): void {
    this.state = { kind: "none" };
  }

  public isEmpty(): boolean {
    return this.state.kind === "none";
  }

  public isCellFocused(row: number, col: number): boolean {
    return this.state.kind === "cell" && this.state.row === row && this.state.col === col;
  }

  public isRowFocused(row: number): boolean {
    return this.state.kind === "row" && this.state.row === row;
  }

  public isColumnFocused(col: number): boolean {
    return this.state.kind === "column" && this.state.col === col;
  }

  public isRowHighlighted(row: number): boolean {
    if (this.state.kind === "cell") return this.state.row === row;
    if (this.state.kind === "row") return this.state.row === row;
    return false;
  }

  public isColumnHighlighted(col: number): boolean {
    if (this.state.kind === "cell") return this.state.col === col;
    if (this.state.kind === "column") return this.state.col === col;
    return false;
  }

  public applyTo(containerEl: HTMLElement): void {
    containerEl.querySelectorAll(FOCUS_CLASS_SELECTOR).forEach((el) => {
      el.classList.remove("is-focused", "is-col-focused", "is-row-focused");
    });

    if (this.state.kind === "none") return;

    if (this.state.kind === "cell" || this.state.kind === "row") {
      const row = this.state.row;
      containerEl
        .querySelector(`.ms-db-tr[data-row-index="${row}"]`)
        ?.classList.add("is-row-focused");
    }

    if (this.state.kind === "cell" || this.state.kind === "column") {
      const col = this.state.col;
      containerEl
        .querySelector(`.ms-db-th[data-col-index="${col}"]`)
        ?.classList.add("is-col-focused");
      containerEl
        .querySelectorAll(`.ms-db-td[data-col-index="${col}"]`)
        .forEach((el) => el.classList.add("is-col-focused"));
    }

    if (this.state.kind === "cell") {
      containerEl
        .querySelector(
          `.ms-db-td[data-row-index="${this.state.row}"][data-col-index="${this.state.col}"]`
        )
        ?.classList.add("is-focused");
    }
  }
}
