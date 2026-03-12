import headerMenuCNData from "@/content/wp/header-menu-cn.json";

type HeaderMenuCNContent = {
  items?: Record<string, unknown>;
};

const menuContent = headerMenuCNData as HeaderMenuCNContent;

export async function getHeaderMenuCN(): Promise<Record<number, string>> {
  const rawItems = menuContent.items || {};
  const items: Record<number, string> = {};

  for (const [key, value] of Object.entries(rawItems)) {
    if (typeof value !== "string") continue;
    const id = Number(key);
    if (Number.isNaN(id)) continue;
    items[id] = value;
  }

  return items;
}
