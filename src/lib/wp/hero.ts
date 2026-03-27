import type { NormRow } from "./normalize";

function isFullWidthFullBleedRow(row: NormRow | null | undefined): boolean {
  if (!row || row.name !== "full_bleed_img") return false;

  return typeof row.data?.width === "string"
    ? row.data.width.trim().toLowerCase() === "full"
    : false;
}

export function getHeroFullBleedRow(rows: NormRow[]): NormRow | null {
  if (!rows.length) return null;

  if (isFullWidthFullBleedRow(rows[0])) {
    return rows[0];
  }

  if (rows[0]?.name === "splash_video" && isFullWidthFullBleedRow(rows[1])) {
    return rows[1];
  }

  return null;
}

export function isHeroFullBleedRowIndex({
  rowIndex,
  firstIsSplash = false,
  width,
}: {
  rowIndex: number;
  firstIsSplash?: boolean;
  width?: string;
}): boolean {
  const normalizedWidth =
    typeof width === "string" ? width.trim().toLowerCase() : "";

  if (normalizedWidth !== "full") return false;

  const normalizedIndex =
    firstIsSplash && rowIndex > 1 ? rowIndex - 1 : rowIndex;

  return normalizedIndex === 1;
}
