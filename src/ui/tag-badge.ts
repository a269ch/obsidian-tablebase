import { getColorScheme } from "../core/color-palette";
import { MultiSelectTag } from "../types";

export interface TagBadgeOptions {
  tag: MultiSelectTag;
  removable?: boolean;
  clickable?: boolean;
  onRemove?: (tag: MultiSelectTag, event: MouseEvent) => void;
  onClick?: (tag: MultiSelectTag, event: MouseEvent) => void;
}

export function createTagBadge(options: TagBadgeOptions): HTMLElement {
  const { tag, removable = false, clickable = false, onRemove, onClick } = options;

  const badgeEl = createSpan({ cls: `ms-tag-badge ms-color-${tag.color}` });
  badgeEl.dataset.tagName = tag.name;
  badgeEl.dataset.tagId = tag.id;

  const colorScheme = getColorScheme(tag.color);
  badgeEl.setCssProps({
    "--tag-bg-light": colorScheme.bg,
    "--tag-text-light": colorScheme.text,
    "--tag-bg-dark": colorScheme.darkBg,
    "--tag-text-dark": colorScheme.darkText,
  });

  badgeEl.createSpan({ cls: "ms-tag-text", text: tag.name });

  if (clickable) {
    badgeEl.classList.add("clickable");
    badgeEl.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick?.(tag, e);
    });
  }

  if (removable) {
    const removeBtn = badgeEl.createSpan({
      cls: "ms-tag-remove-btn",
      text: "×",
      attr: { "aria-label": `Remove ${tag.name}` },
    });
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onRemove?.(tag, e);
    });
  }

  return badgeEl;
}
