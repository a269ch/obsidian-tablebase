import { App } from "obsidian";
import { formatDateByOption, parseAnyDate } from "../../core/date-utils";
import { DateFormatOption } from "../../types";
import { appendIcon } from "../../utils/dom";
import { ICON_CHEVRON_LEFT, ICON_CHEVRON_RIGHT } from "../icons";
import { mountFloatingPopover } from "../popover";

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

const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const YEARS_PER_PAGE = 12;

type DatePickerViewMode = "days" | "months" | "years";

export class DatePickerPopover {
  private options: DatePickerOptions;
  private containerEl: HTMLElement;
  private closePopover?: () => void;
  private viewDate: Date;
  private selectedDateStr: string;
  private selectedDate: Date | null;
  private viewMode: DatePickerViewMode = "days";
  private yearPageStart: number;

  constructor(options: DatePickerOptions) {
    this.options = options;
    this.selectedDateStr = options.currentDate?.trim() ?? "";

    const parsed = parseAnyDate(this.selectedDateStr, this.dateFormat);
    this.selectedDate = parsed;
    this.viewDate = parsed ? new Date(parsed.getTime()) : new Date();
    this.yearPageStart =
      Math.floor(this.viewDate.getFullYear() / YEARS_PER_PAGE) * YEARS_PER_PAGE;

    this.containerEl = createDiv({ cls: "ms-col-header-menu ms-date-picker-popover" });
  }

  private get dateFormat(): DateFormatOption {
    return this.options.dateFormat ?? "YYYY-MM-DD";
  }

  public open(): void {
    this.render();
    this.closePopover = mountFloatingPopover({
      anchorEl: this.options.anchorEl,
      popoverEl: this.containerEl,
      className: "ms-date-picker-popover",
      offsetTop: 4,
      positionToSide: true,
      alwaysBelow: true,
    });
  }

  private close(): void {
    if (this.closePopover) {
      this.closePopover();
      return;
    }
    this.containerEl.remove();
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

  private createNavHeader(config: {
    ariaPrev: string;
    ariaNext: string;
    onPrev: () => void;
    onNext: () => void;
    renderLabel: (header: HTMLElement) => void;
  }): void {
    const header = this.containerEl.createDiv({ cls: "ms-date-month-header" });

    const prevBtn = header.createEl("button", {
      cls: "ms-date-nav-btn",
      attr: { "aria-label": config.ariaPrev },
    });
    appendIcon(prevBtn, ICON_CHEVRON_LEFT);
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      config.onPrev();
      this.render();
    });

    config.renderLabel(header);

    const nextBtn = header.createEl("button", {
      cls: "ms-date-nav-btn",
      attr: { "aria-label": config.ariaNext },
    });
    appendIcon(nextBtn, ICON_CHEVRON_RIGHT);
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      config.onNext();
      this.render();
    });
  }

  private renderDaysView(): void {
    this.createNavHeader({
      ariaPrev: "Previous month",
      ariaNext: "Next month",
      onPrev: () => {
        this.viewDate.setDate(1);
        this.viewDate.setMonth(this.viewDate.getMonth() - 1);
      },
      onNext: () => {
        this.viewDate.setDate(1);
        this.viewDate.setMonth(this.viewDate.getMonth() + 1);
      },
      renderLabel: (header) => this.renderDaysHeaderLabel(header),
    });

    this.renderDaysGrid();
  }

  private renderDaysHeaderLabel(header: HTMLElement): void {
    const monthLabel = header.createSpan({ cls: "ms-date-month-label" });

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
  }

  private renderDaysGrid(): void {
    const daysGrid = this.containerEl.createDiv({ cls: "ms-date-days-grid" });
    for (const day of WEEKDAY_NAMES) {
      daysGrid.createDiv({ cls: "ms-date-day-header", text: day });
    }

    const year = this.viewDate.getFullYear();
    const month = this.viewDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      daysGrid.createDiv({
        cls: "ms-date-day-cell is-other-month",
        text: `${prevMonthDays - i}`,
      });
    }

    const todayFormatted = formatDateByOption(new Date(), this.dateFormat);

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const formatted = formatDateByOption(new Date(year, month, day), this.dateFormat);
      const isSelected =
        (this.selectedDate !== null &&
          this.selectedDate.getFullYear() === year &&
          this.selectedDate.getMonth() === month &&
          this.selectedDate.getDate() === day) ||
        formatted === this.selectedDateStr;
      const isToday = formatted === todayFormatted;

      const cell = daysGrid.createDiv({
        cls: `ms-date-day-cell ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""}`,
        text: `${day}`,
      });

      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        void (async () => {
          await this.options.onSelectDate(formatted);
          this.close();
        })();
      });
    }
  }

  private renderMonthsView(): void {
    this.createNavHeader({
      ariaPrev: "Previous year",
      ariaNext: "Next year",
      onPrev: () => this.viewDate.setFullYear(this.viewDate.getFullYear() - 1),
      onNext: () => this.viewDate.setFullYear(this.viewDate.getFullYear() + 1),
      renderLabel: (header) => {
        const yearLabel = header.createSpan({
          cls: "ms-date-month-label ms-date-label-btn",
          text: `${this.viewDate.getFullYear()}`,
        });
        yearLabel.addEventListener("click", (e) => {
          e.stopPropagation();
          this.viewMode = "years";
          this.render();
        });
      },
    });

    const grid = this.containerEl.createDiv({ cls: "ms-date-grid-picker" });
    const currentMonth = this.viewDate.getMonth();

    MONTH_NAMES.forEach((name, idx) => {
      const btn = grid.createEl("button", {
        cls: `ms-date-grid-item ${idx === currentMonth ? "is-selected" : ""}`,
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
    this.createNavHeader({
      ariaPrev: "Previous decade",
      ariaNext: "Next decade",
      onPrev: () => {
        this.yearPageStart -= YEARS_PER_PAGE;
      },
      onNext: () => {
        this.yearPageStart += YEARS_PER_PAGE;
      },
      renderLabel: (header) => {
        header.createSpan({
          cls: "ms-date-month-label",
          text: `${this.yearPageStart} – ${this.yearPageStart + YEARS_PER_PAGE - 1}`,
        });
      },
    });

    const grid = this.containerEl.createDiv({ cls: "ms-date-grid-picker" });
    const currentYear = new Date().getFullYear();

    for (let y = this.yearPageStart; y < this.yearPageStart + YEARS_PER_PAGE; y++) {
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
