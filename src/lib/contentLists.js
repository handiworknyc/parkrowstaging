function ensureArray(value) {
  return Array.isArray(value) ? value : splitListItems(value);
}

function renderListItemHtml(html, className = "") {
  const classAttribute = className ? ` class="${className}"` : "";
  return `<li${classAttribute}>${html}</li>`;
}

export function splitListItems(value) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/\r?\n/)
    .filter((line) => line.trim());
}

export function normalizeListItems(value) {
  return ensureArray(value);
}

export function isStandaloneListHeading(html) {
  return /^<h4\b[^>]*>[\s\S]*<\/h4>$/i.test((html || "").trim());
}

export function buildTwoColListGroups(value) {
  const normalizedItems = normalizeListItems(value);
  const headingCount = normalizedItems.filter(isStandaloneListHeading).length;

  if (headingCount < 2) {
    return [];
  }

  const groups = [];
  let currentGroup = null;

  normalizedItems.forEach((itemHtml) => {
    if (isStandaloneListHeading(itemHtml)) {
      currentGroup = {
        headingHtml: itemHtml,
        itemHtml: [],
      };
      groups.push(currentGroup);
      return;
    }

    if (!currentGroup) {
      currentGroup = {
        headingHtml: "",
        itemHtml: [],
      };
      groups.push(currentGroup);
    }

    currentGroup.itemHtml.push(itemHtml);
  });

  return groups.filter((group) => group.headingHtml || group.itemHtml.length > 0);
}

export function renderFlatListItemsHtml(value) {
  return normalizeListItems(value)
    .map((itemHtml) => renderListItemHtml(itemHtml))
    .join("");
}

export function renderTwoColListItemsHtml(value) {
  const groups = buildTwoColListGroups(value);

  if (groups.length === 0) {
    return renderFlatListItemsHtml(value);
  }

  return groups
    .map((group) => {
      const nestedListHtml = group.itemHtml.length > 0
        ? `<ul class="section-text two-col-list-group-items">${group.itemHtml
            .map((itemHtml) => renderListItemHtml(itemHtml))
            .join("")}</ul>`
        : "";

      return renderListItemHtml(
        `${group.headingHtml}${nestedListHtml}`,
        "two-col-list-group"
      );
    })
    .join("");
}
