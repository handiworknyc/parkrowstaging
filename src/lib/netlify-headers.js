import {
  STAGING_BASIC_AUTH,
  STAGING_ROBOTS_TAG,
} from "./deploy-env.js";

const STAGING_HEADERS = [
  ["Basic-Auth", STAGING_BASIC_AUTH],
  ["X-Robots-Tag", STAGING_ROBOTS_TAG],
];

function headerPattern(name) {
  return new RegExp(
    `^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`,
    "i"
  );
}

function isBlockStart(line) {
  const trimmed = line.trim();
  return Boolean(trimmed) && !/^\s/.test(line) && !trimmed.startsWith("#");
}

function getRootBlockEnd(lines, rootIndex) {
  for (let index = rootIndex + 1; index < lines.length; index += 1) {
    if (!lines[index].trim() || isBlockStart(lines[index])) {
      return index;
    }
  }

  return lines.length;
}

export function upsertRootHeader(content, name, value) {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const lines = normalizedContent.split("\n");
  const rootIndex = lines.findIndex((line) => line.trim() === "/*");
  const headerLine = `  ${name}: ${value}`;

  if (rootIndex === -1) {
    const trimmedContent = normalizedContent.trimEnd();
    return `${trimmedContent}${trimmedContent ? "\n\n" : ""}/*\n${headerLine}\n`;
  }

  const blockEnd = getRootBlockEnd(lines, rootIndex);
  const existingHeaderIndex = lines.findIndex((line, index) => {
    return (
      index > rootIndex &&
      index < blockEnd &&
      headerPattern(name).test(line)
    );
  });

  if (existingHeaderIndex !== -1) {
    lines[existingHeaderIndex] = headerLine;
  } else {
    lines.splice(blockEnd, 0, headerLine);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function addStagingNetlifyHeaders(content) {
  return STAGING_HEADERS.reduce(
    (headers, [name, value]) => upsertRootHeader(headers, name, value),
    content
  );
}
