import { TAG_PALETTE_COLORS } from "../core/color-palette";
import { MultiSelectTag } from "../types";

export interface TagBadgeOptions {
  tag: MultiSelectTag;
  removable?: boolean;
  clickable?: boolean;
  onRemove?: (tag: MultiSelectTag, event: MouseEvent) => void;
  onClick?: (tag: MultiSelectTag, event: MouseEvent) => void;
}

/**
 * Creates a multi-select tag badge DOM element.
 */
export function createTagBadge(options: TagBadgeOptions): HTMLElement {
  const { tag, removable = false, clickable = false, onRemove, onClick } = options;

  const badgeEl = document.createElement("span");
  badgeEl.className = `ms-tag-badge ms-color-${tag.color}`;
  badgeEl.dataset.tagName = tag.name;
  badgeEl.dataset.tagId = tag.id;

  const colorScheme = TAG_PALETTE_COLORS[tag.color] || TAG_PALETTE_COLORS.default;
  badgeEl.style.setProperty("--tag-bg-light", colorScheme.bg);
  badgeEl.style.setProperty("--tag-text-light", colorScheme.text);
  badgeEl.style.setProperty("--tag-bg-dark", colorScheme.darkBg);
  badgeEl.style.setProperty("--tag-text-dark", colorScheme.darkText);

  const textEl = document.createElement("span");
  textEl.className = "ms-tag-text";
  textEl.textContent = tag.name;
  badgeEl.appendChild(textEl);

  if (clickable) {
    badgeEl.classList.add("clickable");
    badgeEl.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick?.(tag, e);
    });
  }

  if (removable) {
    const removeBtn = document.createElement("span");
    removeBtn.className = "ms-tag-remove-btn";
    removeBtn.innerHTML = "&times;";
    removeBtn.setAttribute("aria-label", `Remove ${tag.name}`);
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onRemove?.(tag, e);
    });
    badgeEl.appendChild(removeBtn);
  }

  return badgeEl;
}
