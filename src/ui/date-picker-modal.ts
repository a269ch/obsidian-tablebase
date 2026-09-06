import { App } from "obsidian";
import { DateFormatOption } from "../types";
import { formatDateByOption, parseDateByOption } from "../core/date-utils";
import { mountFloatingPopover } from "./popover-utils";
import { ICON_CHEVRON_LEFT, ICON_CHEVRON_RIGHT } from "./icons";

export interface DatePickerOptions {
  app: App;
  anchorEl: HTMLElement;
  currentDate?: string;
  dateFormat?: DateFormatOption;
  onSelectDate: (formattedDate: string) => Promise<void>;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type DatePickerViewMode = "days" | "months" | "years";

export class DatePickerPopover {
  private options: DatePickerOptions;
  private containerEl: HTMLElement;
  private closePopover?: () => void;
  private viewDate: Date;
  private selectedDateStr: string;
  private viewMode: DatePickerViewMode = "days";
  private yearDecadeStart: number;

  constructor(options: DatePickerOptions) {
    this.options = options;
    this.selectedDateStr = options.currentDate?.trim() || "";

    const dateFormat = options.dateFormat || "YYYY-MM-DD";
    const parsed = parseDateByOption(this.selectedDateStr, dateFormat);
    this.viewDate = parsed || new Date();
    this.yearDecadeStart = Math.floor(this.viewDate.getFullYear() / 12) * 12;

    this.containerEl = document.createElement("div");
    this.containerEl.className = "ms-col-header-menu ms-date-picker-popover";
  }

  public open(): void {
    this.render();
    this.closePopover = mountFloatingPopover({
      anchorEl: this.options.anchorEl,
      popoverEl: this.containerEl,
      className: "ms-date-picker-popover",
      offsetTop: 4,
    });
  }

  private render(): void {
    this.containerEl.empty();

    if (this.viewMode === "days") {
      this.renderDaysView();
    } else if (this.viewMode === "months") {
      this.renderMonthsView();
    } else {
      this.renderYearsView();
    }
  }

  private renderDaysView(): void {
    const monthHeader = this.containerEl.createDiv({ cls: "ms-date-month-header" });
    const prevBtn = monthHeader.createEl("button", {
      cls: "ms-date-nav-btn",
      attr: { "aria-label": "Previous month" },
    });
    prevBtn.innerHTML = ICON_CHEVRON_LEFT;
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.viewDate.setDate(1);
      this.viewDate.setMonth(this.viewDate.getMonth() - 1);
      this.render();
    });

    const monthLabel = monthHeader.createSpan({ cls: "ms-date-month-label" });

    const monthNameBtn = monthLabel.createSpan({
      cls: "ms-date-label-btn",
      text: MONTH_NAMES[this.viewDate.getMonth()],
    });
    monthNameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.viewMode = "months";
      this.render();
    });

    const yearBtn = monthLabel.createSpan({
      cls: "ms-date-label-btn",
      text: `${this.viewDate.getFullYear()}`,
    });
    yearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.viewMode = "years";
      this.render();
    });

    const nextBtn = monthHeader.createEl("button", {
      cls: "ms-date-nav-btn",
      attr: { "aria-label": "Next month" },
    });
    nextBtn.innerHTML = ICON_CHEVRON_RIGHT;
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.viewDate.setDate(1);
      this.viewDate.setMonth(this.viewDate.getMonth() + 1);
      this.render();
    });

    // Weekday Headers
    const daysGrid = this.containerEl.createDiv({ cls: "ms-date-days-grid" });
    const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    weekdays.forEach((day) => {
      daysGrid.createDiv({ cls: "ms-date-day-header", text: day });
    });

    // Grid Calculations
    const year = this.viewDate.getFullYear();
    const month = this.viewDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    // Previous month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      daysGrid.createDiv({
        cls: "ms-date-day-cell is-other-month",
        text: `${prevMonthDays - i}`,
      });
    }

    // Current month days
    const dateFormat = this.options.dateFormat || "YYYY-MM-DD";
    const todayFormatted = formatDateByOption(new Date(), dateFormat);

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const currentDayDate = new Date(year, month, day);
      const formatted = formatDateByOption(currentDayDate, dateFormat);

      const isSelected = formatted === this.selectedDateStr;
      const isToday = formatted === todayFormatted;

      const cell = daysGrid.createDiv({
        cls: `ms-date-day-cell ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}`,
        text: `${day}`,
      });

      cell.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.options.onSelectDate(formatted);
        if (this.closePopover) {
          this.closePopover();
        } else {
          this.containerEl.remove();
        }
      });
    }
  }

  private renderMonthsView(): void {
    const monthHeader = this.containerEl.createDiv({ cls: "ms-date-month-header" });
    const prevBtn = monthHeader.createEl("button", {
      cls: "ms-date-nav-btn",
      attr: { "aria-label": "Previous year" },
    });
    prevBtn.innerHTML = ICON_CHEVRON_LEFT;
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.viewDate.setFullYear(this.viewDate.getFullYear() - 1);
      this.render();
    });

    const yearLabel = monthHeader.createSpan({
      cls: "ms-date-month-label ms-date-label-btn",
      text: `${this.viewDate.getFullYear()}`,
    });
    yearLabel.addEventListener("click", (e) => {
      e.stopPropagation();
      this.viewMode = "years";
      this.render();
    });

    const nextBtn = monthHeader.createEl("button", {
      cls: "ms-date-nav-btn",
      attr: { "aria-label": "Next year" },
    });
    nextBtn.innerHTML = ICON_CHEVRON_RIGHT;
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.viewDate.setFullYear(this.viewDate.getFullYear() + 1);
      this.render();
    });

    const grid = this.containerEl.createDiv({ cls: "ms-date-grid-picker" });
    const months = MONTH_NAMES;
    const currentMonth = this.viewDate.getMonth();

    months.forEach((name, idx) => {
      const isCurrent = idx === currentMonth;
      const btn = grid.createEl("button", {
        cls: `ms-date-grid-item ${isCurrent ? "is-selected" : ""}`,
        text: name.slice(0, 3),
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.viewDate.setMonth(idx);
        this.viewMode = "days";
        this.render();
      });
    });
  }

  private renderYearsView(): void {
    const monthHeader = this.containerEl.createDiv({ cls: "ms-date-month-header" });
    const prevBtn = monthHeader.createEl("button", {
      cls: "ms-date-nav-btn",
      attr: { "aria-label": "Previous decade" },
    });
    prevBtn.innerHTML = ICON_CHEVRON_LEFT;
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.yearDecadeStart -= 12;
      this.render();
    });

    monthHeader.createSpan({
      cls: "ms-date-month-label",
      text: `${this.yearDecadeStart} – ${this.yearDecadeStart + 11}`,
    });

    const nextBtn = monthHeader.createEl("button", {
      cls: "ms-date-nav-btn",
      attr: { "aria-label": "Next decade" },
    });
    nextBtn.innerHTML = ICON_CHEVRON_RIGHT;
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.yearDecadeStart += 12;
      this.render();
    });

    const grid = this.containerEl.createDiv({ cls: "ms-date-grid-picker" });
    const currentYear = new Date().getFullYear();

    for (let y = this.yearDecadeStart; y < this.yearDecadeStart + 12; y++) {
      const isSelected = y === this.viewDate.getFullYear();
      const isCurrent = y === currentYear;

      const item = grid.createDiv({
        cls: `ms-date-grid-item ${isSelected ? "is-selected" : ""} ${isCurrent ? "is-current" : ""}`,
        text: `${y}`,
      });

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        this.viewDate.setFullYear(y);
        this.viewMode = "months";
        this.render();
      });
    }
  }
}
