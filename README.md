# TableBase for Obsidian

> 🚀 **Transform standard Obsidian Markdown tables into interactive, Notion-like databases with Kanban Board views, multi-select colored badges, date pickers, calculations, multi-criteria filtering, and CSV export — with 100% zero lock-in.**

[![CI](https://github.com/a269ch/obsidian-tablebase/actions/workflows/ci.yml/badge.svg)](https://github.com/a269ch/obsidian-tablebase/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/a269ch/obsidian-tablebase?color=orange&label=release&logo=github)](https://github.com/a269ch/obsidian-tablebase/releases)
[![Tests](https://img.shields.io/badge/tests-124%20passed-brightgreen.svg?logo=vitest&logoColor=white)](#development--testing)
[![Coverage](https://img.shields.io/badge/coverage-96.3%25-brightgreen.svg?logo=vitest&logoColor=white)](#development--testing)
[![Obsidian](https://img.shields.io/badge/Obsidian-v1.0.0+-7C3AED.svg?logo=obsidian&logoColor=white)](https://obsidian.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%20Strict-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Lock-in](https://img.shields.io/badge/Lock--in-Zero%20(Pure%20Markdown)-success.svg?logo=markdown&logoColor=white)](#why-tablebase)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?logo=github)](https://github.com/a269ch/obsidian-tablebase/pulls)

---

## ✨ Why TableBase?

Raw Markdown tables in Obsidian are often rigid, painful to edit, and difficult to organize. Traditional database plugins solve this by forcing proprietary JSON blocks, custom schema files, or isolated databases that lock your data into a specific plugin.

**TableBase** solves this fundamentally:

```
    Raw Markdown Note (.md)
  ┌─────────────────────────┐
  │ | Task | Status | Due | │
  │ | ---- | ------ | --- | │
  │ | Work | Done   | ... | │
  └───────────┬─────────────┘
              ▲
              │ Non-destructive, instant bidirectional sync
              ▼
  ┌─────────────────────────────────────────────────────────┐
  │                 TableBase Engine                        │
  │  ┌─────────────────────────┬─────────────────────────┐  │
  │  │  📋 Interactive Table   │  🗂️ Kanban Board View   │  │
  │  └─────────────────────────┴─────────────────────────┘  │
  │  • Multi-select badges     • Drag-and-drop cards        │
  │  • Single-select popovers  • Context menus (edit/dup)   │
  │  • Datepicker calendar     • Footer calculations (Sum)  │
  │  • Granular AND/OR filters • Column resize & reorder    │
  └─────────────────────────────────────────────────────────┘
```

- **Zero Lock-In**: Everything is read from and saved back to standard GitHub Flavored Markdown (GFM) tables. If you ever disable the plugin or open your vault in VS Code, GitHub, or any other editor, your data is 100% standard text.
- **Dual Views**: Seamlessly switch between **`📋 Table`** and **`🗂️ Board`** (Kanban) with one click.
- **Native Experience**: Matches Obsidian's native look and feel with full Light & Dark theme support.

---

## 📊 Feature Comparison

| Feature | Standard Obsidian Tables | Traditional DB Plugins | TableBase |
| :--- | :---: | :---: | :---: |
| **Data Storage Format** | Standard Markdown | Proprietary JSON / SQLite | **100% Pure Markdown** |
| **Zero Vendor Lock-in** | ✅ | ❌ | ✅ |
| **Kanban Board View** | ❌ | Partial | ✅ **Built-in 1-Click Tab** |
| **Colored Tag Badges** | ❌ | Partial | ✅ **10 Notion Palettes** |
| **Single-Select Dropdown** | ❌ | ❌ | ✅ **Instant Popover** |
| **Interactive Date Picker** | ❌ | ❌ | ✅ **Calendar + Presets** |
| **Footer Calculation Bar** | ❌ | Partial | ✅ **Sum, Avg, Min, Max, Count** |
| **AND / OR Filter Rules** | ❌ | Query Language | ✅ **Visual UI Panel** |
| **Multi-Column Sorting** | ❌ | Complex syntax | ✅ **Clickable Rules** |
| **Drag & Drop Reordering** | ❌ | ❌ | ✅ **Rows, Cols & Kanban** |
| **Live Table Search** | ❌ | ❌ | ✅ **Instant Full-Text** |
| **CSV Export** | ❌ | ❌ | ✅ **1-Click Copy / Download** |

---

## 🌟 Key Features Breakdown

### 1. 🎨 Multi-Select & Single-Select Tags (Notion-Themed Badges)
- **Automatic Detection**: Recognizes status and tag columns automatically (`Tags`, `Status`, `Priority`, `Category`, `Labels`, `Теги`, `Метки`, `Статус`, etc.).
- **Single-Select (`🔘 Select`)**: Fast 1-click popover for single-value states (e.g., *Todo*, *In Progress*, *Done*).
- **Multi-Select (`🏷️ Multi-Select`)**: Add, search, and toggle multiple colored badges per cell.
- **10 Notion-Themed Color Schemes**: `Default`, `Gray`, `Brown`, `Orange`, `Yellow`, `Green`, `Blue`, `Purple`, `Pink`, and `Red`.
- **Custom Tag Palette**: Pick custom colors per tag with memory across your vault.

### 2. 🗂️ Kanban Board View
- Switch between **`📋 Table`** and **`🗂️ Board`** views with a single click.
- Group cards by any Select or Multi-Select column.
- **HTML5 Drag-and-Drop**: Drag task cards between status columns to update values immediately.
- **Interactive Card Badges**: Click any property on a card to edit dates, tags, numbers, or checkboxes without leaving the board.
- **Inline Card Editing**: Double-click card titles to rename directly on the board.
- **Card Context Menu**: Right-click to duplicate, rename, or delete cards.
- **`+ New` Card Buttons**: Create new records pre-populated with column values.

### 3. 🔍 Advanced Multi-Criteria Filter & Sort Engine
- **Filter Toolbar**: Add granular rules connected by **`AND`** / **`OR`** conjunction logic.
- **Type-Aware Filter Operators**:
  - `is one of` / `is not one of` (multi-tag matching)
  - `contains` / `does not contain` / `contains all of` / `contains any of`
  - `equals` / `not equals` / `starts with` / `ends with`
  - `is empty` / `is not empty` / `is checked` / `is not checked`
- **Multi-Column Sorting**: Ascending and descending sort rules with natural language, numeric, and date ordering.
- **Real-Time Live Search**: Instant full-text search across all table rows.

### 4. 📅 Notion-Style Interactive Date Picker
- Click on any date cell to open an interactive calendar popover.
- Quick navigation presets: **Today**, **Tomorrow**, **Next week**, and **Clear**.
- Full month calendar grid with month/year navigation.
- Configurable global **Default Date Format** in plugin settings (`YYYY-MM-DD`, `DD.MM.YYYY`, `MM/DD/YYYY`, `YYYY/MM/DD`).

### 5. 📊 Footer Calculations & Summaries (`tfoot`)
- Compute real-time column aggregates aligned directly below table columns:
  - **Numeric**: `Sum`, `Average`, `Min`, `Max`, `Count`
  - **Tags / Text**: `Count all`, `Count values`, `Unique count`, `Empty / Not empty`
  - **Checkboxes**: `Count checked / unchecked`, `Percent checked / unchecked`

### 6. 🔀 Column & Row Management
- **Reorder Columns**: Drag table column headers (`th`) left or right to rearrange fields.
- **Reorder Rows**: Drag row index handles (`#`) up or down to reorder records.
- **Column Resizing**: Drag column borders to set custom widths.
- **Context Menus**: Right-click headers or cells to insert, duplicate, hide, or delete properties and rows.
- **Sticky First Column**: Row indices and primary title columns remain pinned during horizontal scrolling.
- **Property Visibility (`⚙️ Properties`)**: Show or hide specific columns without deleting markdown data.

### 7. 📤 1-Click CSV Export
- **Copy as CSV**: Copy clean CSV directly to clipboard for Excel or Google Sheets.
- **Download CSV**: Save as a `.csv` file with a single click.

---

## 🏷️ Optional Explicit Column Type Annotations

TableBase intelligently auto-detects column types. However, if you want to explicitly enforce a column type in your Markdown header, you can append an annotation to the header name:

| Syntax | Type | Description |
| :--- | :--- | :--- |
| `Task [text]` | Text | Standard text input |
| `Status [select]` | Single-Select | Single tag selection popover |
| `Tags [multi-select]` | Multi-Select | Multiple colored tag pills |
| `Due [date]` | Date | Calendar popover with default format |
| `Due [date:DD.MM.YYYY]` | Date | Calendar popover with specific format |
| `Estimate [number]` | Number | Strict numeric formatting and formulas |
| `Done [checkbox]` | Checkbox | Toggleable interactive checkbox |

*Note: Annotations are automatically hidden in TableBase view and rendered cleanly.*

---

## 🚀 Quick Start

Create a standard GFM Markdown table in any note:

```markdown
| Task | Status | Tags | Deadline | Hours | Done |
| :--- | :---: | :--- | :---: | :---: | :---: |
| Build Core Engine | Done | Backend, Core | 2026-09-05 | 12 | [x] |
| Add Kanban Board | In Progress | Frontend, UI | 2026-09-10 | 8 | [ ] |
| Write Unit Tests | Done | QA, Testing | 2026-09-12 | 4 | [x] |
| Documentation | Backlog | Docs | 2026-09-15 | 2 | [ ] |
```

Open the note in **Reading View** or **Live Preview** — TableBase automatically renders it as an interactive database.

You can also explicitly scope a table using a code block:
````markdown
```tablebase
| Task | Status | Priority |
| Design Mockups | In Progress | High |
| Code Review | Todo | Medium |
```
````

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`Arrow Keys`** | Navigate between table cells |
| **`Tab`** / **`Shift + Tab`** | Move focus to next / previous cell |
| **`Enter`** | Open inline text editor or select popover |
| **`Escape`** | Cancel inline edit or dismiss popover |
| **`Delete`** / **`Backspace`** | Clear cell content |
| **`Double Click`** | Start inline editing |
| **`Right Click`** | Open context menu (sort, hide, duplicate, delete, reorder) |

---

## ⚙️ Configuration

Access settings via **Obsidian Settings -> TableBase**:

- **Auto-detect Multi-select Columns**: Toggle automatic detection based on cell content (lists, wikilinks, tags).
- **Multi-select Column Names**: Customize comma-separated keywords to always treat as tags (`Tags, Status, Categories, Теги, Метки...`).
- **Default Tag Format**: Choose how tags are written back to Markdown cells:
  - Comma-separated: `Frontend, UI, Bug`
  - WikiLinks: `[[Frontend]], [[UI]]`
  - Hashtags: `#Frontend #UI`
- **Default Date Format**: Set your preferred default format (`YYYY-MM-DD`, `DD.MM.YYYY`, `MM/DD/YYYY`, `YYYY/MM/DD`).
- **Custom Tag Colors**: Assign persistent palette colors to specific tag names.

---

## 🎨 CSS Snippets & Customization

TableBase exposes clean CSS classes and variables that can be customized in Obsidian snippets:

```css
/* Custom TableBase Accent & Colors */
.ms-notion-database-container {
  --ms-primary: var(--interactive-accent);
  --ms-border-color: var(--background-modifier-border);
  --ms-bg-hover: var(--background-modifier-hover);
}

/* Custom Kanban Card Styling */
.ms-kanban-card {
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
```

---

## 📦 Installation

### Via Obsidian Community Plugins
*(Submitted / Pending catalog directory indexing)*
1. Open Obsidian **Settings** -> **Community plugins**.
2. Search for **TableBase**.
3. Click **Install**, then **Enable**.

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/a269ch/obsidian-tablebase/releases).
2. Open your Obsidian Vault and navigate to `.obsidian/plugins/`.
3. Create a folder named `tablebase` and place the downloaded files inside.
4. Open **Obsidian Settings -> Community plugins**, click **Reload plugins**, and enable **TableBase**.

---

## 🛠️ Development & Testing

```bash
# 1. Clone repository
git clone https://github.com/a269ch/obsidian-tablebase.git
cd obsidian-tablebase

# 2. Install dependencies
npm install

# 3. Run test suite (124 automated tests, 100% passing)
npm test

# 4. Run test coverage report (96.3% statements coverage)
npm run test:coverage

# 5. Build production bundle
npm run build

# 6. Package plugin distribution zip
npm run package
```

---

## 📄 License

MIT License © 2026 Aleksei Che (a269ch)
