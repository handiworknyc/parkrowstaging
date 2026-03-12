import headerMenuData from "@/content/wp/header-menu.json";

type HeaderMenuContent = {
  html?: unknown;
};

const menuContent = headerMenuData as HeaderMenuContent;

export async function getHeaderMenu(): Promise<string> {
  return typeof menuContent.html === "string" ? menuContent.html : "";
}
