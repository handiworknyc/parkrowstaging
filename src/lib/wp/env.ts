import { getEnv } from "../env.ts";

export function getGraphQLEndpoint(): string | null {
  const wp = getEnv("WORDPRESS_API_URL").trim();
  const base = getEnv("WP_BASE_URL").trim();
  if (wp) return wp;
  if (base) return new URL("/graphql", base).toString();
  return null;
}

export function authHeaders(): Record<string, string> {
  const pair = getEnv("WP_AUTH_BASIC").trim();
  if (!pair) return {};
  const token = Buffer.from(pair, "utf8").toString("base64");
  return { Authorization: `Basic ${token}` };
}
