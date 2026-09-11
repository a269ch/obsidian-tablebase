# TableBase for Obsidian

> **Transform standard Markdown tables into beautiful, interactive Notion-like databases and Kanban boards — with 100% zero vendor lock-in.**

[![Release](https://img.shields.io/github/v/release/a269ch/obsidian-tablebase?color=orange&label=Release&logo=github)](https://github.com/a269ch/obsidian-tablebase/releases)
[![Tests](https://img.shields.io/badge/Tests-286%20Passed-brightgreen.svg?logo=vitest&logoColor=white)](https://github.com/a269ch/obsidian-tablebase)
[![Obsidian](https://img.shields.io/badge/Obsidian-v1.5.0+-7C3AED.svg?logo=obsidian&logoColor=white)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ Overview

Editing tables in plain Markdown can be frustrating. Moving columns, picking dates, and formatting tags often feels clumsy, while traditional database plugins lock your notes into proprietary files and databases.

**TableBase gives you the best of both worlds**:
An intuitive, fluid, Notion-style visual database experience right inside Obsidian — while keeping your files stored as **100% standard, clean Markdown tables**.

* Open your notes on mobile, in VS Code, or on GitHub — your data is always plain, readable text.
* Turn any table into an interactive database or Kanban board instantly.

---

## 🌟 Key Features

### 📋 Interactive Notion-Style Tables
* **Click to Edit**: Double-click any cell or press `Enter` to edit text, numbers, or tags smoothly.
* **Row Numbers**: Clean, numbered row indicator that lets you select, focus, or delete rows in a click.
* **Column Resizing & Reordering**: Drag column borders to adjust widths, or drag headers to rearrange fields.
* **Fast Row Reordering**: Hover over any row and drag the floating handle (`⋮⋮`) in the left margin to reorder rows effortlessly.

### 🗂️ 1-Click Kanban Board View
* **Switch Views Instantly**: Toggle between **Table** and **Board** tabs with a single click.
* **Drag-and-Drop Cards**: Move task cards between columns (e.g. *Todo* → *In Progress* → *Done*) to update your notes automatically.
* **Quick Add**: Click `+ New` at the bottom of any column to create pre-categorized cards.
* **Edit on the Board**: Double-click card titles to rename, or click tag badges and dates directly on cards.

### 🏷️ Colored Tags & Multi-Select
* **Automatic Detection**: Automatically recognizes tag and status columns (`Status`, `Tags`, `Priority`, etc.).
* **Single-Select Popover**: Quick dropdown menu for single-value statuses (*Todo*, *In Progress*, *Done*).
* **Multi-Select Badges**: Add multiple colored tags to any cell with search-as-you-type and instant badge creation.
* **10 Notion-Inspired Color Palettes**: `Gray`, `Brown`, `Orange`, `Yellow`, `Green`, `Blue`, `Purple`, `Pink`, `Red`, and `Default`.
* **Custom Color Picker**: Pick any custom hex color with automatic text-contrast adaptation for light and dark themes.

### 📅 Visual Date Picker
* **Interactive Calendar**: Click any date cell to open a clean calendar popover.
* **Quick Navigation**: Jump effortlessly across days, months, and years.
* **Flexible Date Formats**: Supports `YYYY-MM-DD`, `DD.MM.YYYY`, `DD/MM/YYYY`, `MM/DD/YYYY`, and more.
* **Batch Reformatting**: Changing a column's date format cleanly converts all existing dates in that column.

### 🔍 Visual Filter & Live Search
* **No Code Required**: Build powerful filters using a simple visual interface.
* **Flexible Logic**: Combine rules with **AND** and **OR** conditions (*Where Status is "In Progress" AND Due date is not empty*).
* **Type-Specific Filters**:
  * *Tags*: `is one of`, `is not one of`, `contains`, `is empty`...
  * *Text & Numbers*: `contains`, `equals`, `is empty`...
  * *Checkboxes*: `is checked`, `is not checked`
* **Instant Search**: Type in the search box to filter matching rows across all columns in real time.

### 🧮 Summary Calculations
* Real-time column summaries in the table footer:
  * **Numbers**: `Sum`, `Average`, `Min`, `Max`, `Count`
  * **Tags & Text**: `Count all`, `Unique count`, `Empty`, `Not empty`
  * **Checkboxes**: `Checked count`, `Unchecked count`, `Percent completed`

### 📤 1-Click CSV Export
* **Copy as CSV**: Copy clean CSV directly to your clipboard for Excel, Google Sheets, or Apple Numbers.
* **Download CSV**: Save your table as a `.csv` file with a single click.

---

## 🚀 Quick Start

### 1. Standard Markdown Table
Create a normal table in any note:

```markdown
| Task | Status | Tags | Due | Done |
| :--- | :--- | :--- | :--- | :---: |
| Launch website | In Progress | Marketing, Web | 2026-09-15 | [ ] |
| Write release notes | Todo | Docs | 2026-09-18 | [ ] |
| Core refactoring | Done | Dev | 2026-09-07 | [x] |
```

Switch to **Reading View** — TableBase automatically transforms standard Markdown tables into interactive databases.

> [!NOTE]
> Standard Markdown tables are rendered as TableBase databases in **Reading View**. Direct Live Preview support for standard tables is in active development. For an interactive view directly inside Live Preview today, you can also use an optional ```` ```tablebase ```` code block.

### 2. Explicit Code Block (Optional)
You can also use a dedicated ```` ```tablebase ```` code block:

````markdown
```tablebase
| Project | Priority | Deadline | Done |
| Mobile App | High | 2026-10-01 | [ ] |
| Security Audit | Medium | 2026-10-15 | [x] |
```
````

---

## 📝 Optional Column Type Hints

TableBase automatically detects column types based on content and header names. If you prefer to explicitly specify a type, simply add a tag to the column title:

| Syntax | Column Type | Behavior |
| :--- | :--- | :--- |
| `Task [text]` | Text | Standard text input |
| `Status [select]` | Single-Select | Single-choice tag dropdown |
| `Tags [multi-select]` | Multi-Select | Multi-tag badge picker |
| `Due [date]` | Date | Visual calendar popover |
| `Due [date:DD.MM.YYYY]` | Date | Calendar with specific format |
| `Amount [number]` | Number | Strict numeric formatting |
| `Done [checkbox]` | Checkbox | Centered interactive checkbox |

*Tip: Type tags like `[date]` are automatically hidden in the visual view for a clean appearance.*

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **`Arrow Keys`** | Move between cells |
| **`Tab`** / **`Shift + Tab`** | Move to next / previous cell (wraps to next row) |
| **`Enter`** | Edit cell, toggle checkbox, or open date/tag picker |
| **`Any letter or digit`** | Start typing immediately to edit the focused cell |
| **`Escape`** | Cancel editing, close popover, or deselect cell |
| **`Right Click`** | Open menu (insert/delete rows and columns, change alignment) |

*Tip: Pressing `Tab` on the very last cell of the table automatically adds a new row, allowing rapid data entry without touching the mouse.*

---

## 🔒 100% Plain Markdown & Zero Lock-In

Your data belongs to you. TableBase:
* Stores everything as standard GitHub-Flavored Markdown tables.
* Never alters your note formatting unexpectedly.
* Does not create hidden sidecar database files.
* If you disable or uninstall TableBase, your tables remain completely intact, formatted, and readable in any Markdown reader.

---

## ⚙️ Settings & Customization

Configure preferences under **Obsidian Settings → TableBase**:
* **Default Date Format**: Set your preferred date display (`YYYY-MM-DD`, `DD.MM.YYYY`, etc.).
* **Default Tag Format**: Choose how tags are written back to Markdown (`Comma-separated`, `#hashtags`, or `[[wikilinks]]`).
* **Auto-Detection**: Customize header keywords recognized as tags or statuses.
* **Row Numbers**: Toggle row index numbers on or off globally.
* **Custom Tag Colors**: Assign permanent colors to specific tags across your entire vault.

---

## 🛡️ Security & Privacy

TableBase is engineered as a private, local-first extension for Obsidian:
* **100% Local**: No network requests, telemetry, or remote data transmission. All logic executes strictly inside your local Obsidian vault.
* **Clipboard Access**: The clipboard API (`navigator.clipboard.writeText`) is invoked exclusively when you select the "Copy table as CSV" option from the export menu. The plugin never reads from the system clipboard.
* **Data Preservation**: Tables are read and written using Obsidian's official vault APIs to safeguard file history and avoid data loss.

---

## 📦 Installation

### From Obsidian Community Plugins
1. Open Obsidian **Settings** → **Community plugins**.
2. Ensure **Restricted mode** is disabled.
3. Click **Browse** and search for **TableBase**.
4. Click **Install**, then **Enable**.

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [Latest Release](https://github.com/a269ch/obsidian-tablebase/releases).
2. Open your Obsidian vault folder and navigate to `.obsidian/plugins/`.
3. Create a folder named `tablebase` and copy the three files into it.
4. Go to **Settings → Community plugins**, click **Reload plugins**, and turn on **TableBase**.

---

## 📄 License

MIT License © 2026 Aleksei Chekodanov
