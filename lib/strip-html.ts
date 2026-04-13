export type StripHtmlResult = {
  pretty: string;
  minified: string;
  markdown: string;
  status: "idle" | "ready";
  charCount: number;
  nodeCount: number;
};

const PREVIEW_STYLES = `
  <style>
    :root { color-scheme: light; }
    body {
      font-family: Inter, system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      padding: 16px;
      color: #111827;
      background: #ffffff;
      overflow-wrap: anywhere;
    }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 600; }
    pre {
      white-space: pre-wrap;
      background: #f8fafc;
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    blockquote {
      margin: 0;
      padding-left: 12px;
      border-left: 3px solid #d1d5db;
      color: #4b5563;
    }
    img { max-width: 100%; height: auto; }
    a { color: #2563eb; }
  </style>
`;

const ATTR_WHITELIST: Record<string, string[]> = {
  a: ["href"],
  img: ["src", "alt", "width", "height"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  ol: ["type", "start"],
  li: ["value"],
  code: ["class"],
};

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const TABLE_CELL_ELEMENTS = new Set(["td", "th"]);

const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "dialog",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const FORBIDDEN_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "link",
  "meta",
]);

const EMPTY_RESULT: StripHtmlResult = {
  pretty: "",
  minified: "",
  markdown: "",
  status: "idle",
  charCount: 0,
  nodeCount: 0,
};

function canUseDom() {
  return typeof document !== "undefined";
}

function decodeUrl(url: string) {
  try {
    return decodeURIComponent(url.replace(/\+/g, " "));
  } catch {
    return url;
  }
}

function decodeEncodedText(text: string) {
  return text.replace(/((?:%[0-9A-Fa-f]{2}|\+)+)/g, (match) => {
    try {
      return decodeURIComponent(match.replace(/\+/g, " "));
    } catch {
      return match;
    }
  });
}

function cleanNode(node: Node): Node | DocumentFragment | null {
  if (node.nodeType === Node.TEXT_NODE) {
    node.textContent = decodeEncodedText(node.textContent ?? "");
    return node;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();

  if (FORBIDDEN_TAGS.has(tag)) {
    return null;
  }

  if (tag === "span") {
    const fragment = document.createDocumentFragment();
    Array.from(element.childNodes).forEach((child) => {
      const cleaned = cleanNode(child);
      if (cleaned) fragment.appendChild(cleaned);
    });
    return fragment;
  }

  Array.from(element.attributes).forEach((attribute) => {
    if (attribute.name.startsWith("on")) {
      element.removeAttribute(attribute.name);
    }
  });

  const allowed = ATTR_WHITELIST[tag] ?? [];
  Array.from(element.attributes).forEach((attribute) => {
    if (!allowed.includes(attribute.name)) {
      element.removeAttribute(attribute.name);
    }
  });

  if (tag === "a" && element.hasAttribute("href")) {
    element.setAttribute("href", decodeUrl(element.getAttribute("href") ?? ""));
  }

  const childrenToRemove: Node[] = [];
  Array.from(element.childNodes).forEach((child) => {
    const cleaned = cleanNode(child);
    if (cleaned === null) {
      childrenToRemove.push(child);
    } else if (cleaned !== child) {
      element.replaceChild(cleaned, child);
    }
  });
  childrenToRemove.forEach((child) => element.removeChild(child));

  if (
    !VOID_ELEMENTS.has(tag) &&
    !TABLE_CELL_ELEMENTS.has(tag) &&
    element.textContent?.trim() === "" &&
    !element.querySelector("img, br, hr, input")
  ) {
    return null;
  }

  return element;
}

function prettyPrint(node: Node, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim() ?? "";
    return text ? `${pad}${text}` : "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const isBlock = BLOCK_ELEMENTS.has(tag);

  let attrs = "";
  for (const attr of Array.from(element.attributes)) {
    attrs += ` ${attr.name}="${attr.value}"`;
  }

  if (VOID_ELEMENTS.has(tag)) {
    return `${pad}<${tag}${attrs}>`;
  }

  const children = Array.from(element.childNodes);
  if (children.length === 0) {
    return `${pad}<${tag}${attrs}></${tag}>`;
  }

  const allText = children.every((child) => child.nodeType === Node.TEXT_NODE);

  if (allText || !isBlock) {
    const inner = children
      .map((child) => {
        if (child.nodeType === Node.TEXT_NODE) return child.textContent ?? "";
        return prettyPrint(child, 0).trim();
      })
      .join("")
      .trim();

    return inner ? `${pad}<${tag}${attrs}>${inner}</${tag}>` : "";
  }

  const innerLines = children
    .map((child) => prettyPrint(child, indent + 1))
    .filter((value) => value.trim() !== "");

  if (innerLines.length === 0) return "";

  return `${pad}<${tag}${attrs}>\n${innerLines.join("\n")}\n${pad}</${tag}>`;
}

function minifyHtml(html: string) {
  return html.replace(/\n\s*/g, "").replace(/>\s+</g, "><").trim();
}

function isSimpleTable(tableNode: HTMLTableElement) {
  const cells = tableNode.querySelectorAll("td, th");
  for (const cell of Array.from(cells)) {
    if (cell.hasAttribute("colspan") || cell.hasAttribute("rowspan")) return false;
    for (const child of Array.from(cell.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as HTMLElement).tagName.toLowerCase();
        if (BLOCK_ELEMENTS.has(tag) && tag !== "br") return false;
      }
    }
  }
  return true;
}

function inlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const inner = Array.from(element.childNodes).map(inlineToMarkdown).join("");

  switch (tag) {
    case "strong":
    case "b":
      return `**${inner}**`;
    case "em":
    case "i":
      return `*${inner}*`;
    case "a": {
      const href = element.getAttribute("href") ?? "";
      return `[${inner}](${href})`;
    }
    case "code":
      return `\`${inner}\``;
    case "br":
      return "\n";
    case "img": {
      const alt = element.getAttribute("alt") ?? "";
      const src = element.getAttribute("src") ?? "";
      return `![${alt}](${src})`;
    }
    default:
      return inner;
  }
}

function tableToMarkdown(tableNode: HTMLTableElement) {
  const rows = Array.from(tableNode.querySelectorAll("tr"));
  if (rows.length === 0) return "";

  const markdownRows = rows.map((row) => {
    const cells = Array.from(row.querySelectorAll("th, td"));
    return cells.map((cell) =>
      Array.from(cell.childNodes)
        .map(inlineToMarkdown)
        .join("")
        .replace(/\n/g, " ")
        .replace(/\|/g, "\\|")
        .trim(),
    );
  });

  const columnCount = Math.max(...markdownRows.map((row) => row.length));
  markdownRows.forEach((row) => {
    while (row.length < columnCount) row.push("");
  });

  const lines: string[] = [];
  lines.push(`| ${markdownRows[0].join(" | ")} |`);
  lines.push(`| ${Array(columnCount).fill("---").join(" | ")} |`);

  for (let index = 1; index < markdownRows.length; index += 1) {
    lines.push(`| ${markdownRows[index].join(" | ")} |`);
  }

  return lines.join("\n");
}

function nodeToMarkdown(node: Node, listDepth = 0, listType: string | null = null): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim() ?? "";
    return text || "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tag)) {
    const level = Number.parseInt(tag[1] ?? "1", 10);
    const prefix = "#".repeat(level);
    const text = Array.from(element.childNodes).map(inlineToMarkdown).join("").trim();
    return `${prefix} ${text}`;
  }

  if (tag === "p") {
    return Array.from(element.childNodes).map(inlineToMarkdown).join("").trim();
  }

  if (tag === "blockquote") {
    const inner = Array.from(element.childNodes)
      .map((child) => nodeToMarkdown(child, listDepth, listType))
      .filter(Boolean)
      .join("\n\n");
    return inner
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }

  if (tag === "hr") return "---";

  if (tag === "pre") {
    const codeElement = element.querySelector("code");
    const content = codeElement ?? element;
    let language = "";
    if (codeElement) {
      const match = (codeElement.getAttribute("class") ?? "").match(/language-(\w+)/);
      if (match) language = match[1] ?? "";
    }
    const text = content.textContent ?? "";
    return `\`\`\`${language}\n${text}\n\`\`\``;
  }

  if (tag === "code") return `\`${element.textContent ?? ""}\``;

  if (tag === "ul") {
    return Array.from(element.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child) => nodeToMarkdown(child, listDepth, "ul"))
      .filter(Boolean)
      .join("\n");
  }

  if (tag === "ol") {
    let index = Number.parseInt(element.getAttribute("start") ?? "1", 10);
    return Array.from(element.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child) => {
        const result = nodeToMarkdown(child, listDepth, `ol:${index}`);
        index += 1;
        return result;
      })
      .filter(Boolean)
      .join("\n");
  }

  if (tag === "li") {
    const indent = "  ".repeat(listDepth);
    const bullet = listType?.startsWith("ol:") ? `${listType.split(":")[1]}.` : "-";
    const inlineParts: string[] = [];
    const nestedLists: HTMLElement[] = [];

    Array.from(element.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childTag = (child as HTMLElement).tagName.toLowerCase();
        if (childTag === "ul" || childTag === "ol") {
          nestedLists.push(child as HTMLElement);
          return;
        }
      }
      inlineParts.push(inlineToMarkdown(child));
    });

    const inlineText = inlineParts.join("").trim();
    const lines = [`${indent}${bullet} ${inlineText}`.trimEnd()];

    nestedLists.forEach((nested) => {
      const nestedTag = nested.tagName.toLowerCase();
      let nestedIndex = Number.parseInt(nested.getAttribute("start") ?? "1", 10);
      Array.from(nested.children)
        .filter((child) => child.tagName.toLowerCase() === "li")
        .forEach((child) => {
          const nestedType = nestedTag === "ol" ? `ol:${nestedIndex}` : "ul";
          lines.push(nodeToMarkdown(child, listDepth + 1, nestedType));
          if (nestedTag === "ol") nestedIndex += 1;
        });
    });

    return lines.join("\n");
  }

  if (tag === "table") {
    return isSimpleTable(element as HTMLTableElement)
      ? tableToMarkdown(element as HTMLTableElement)
      : prettyPrint(element, 0);
  }

  if (["strong", "b", "em", "i", "a", "img"].includes(tag)) {
    return inlineToMarkdown(element);
  }

  if (["div", "section", "article", "main", "header", "footer"].includes(tag)) {
    return Array.from(element.childNodes)
      .map((child) => nodeToMarkdown(child, listDepth, listType))
      .filter(Boolean)
      .join("\n\n");
  }

  const inlineFallback = inlineToMarkdown(element).trim();
  return inlineFallback || "";
}

function convertToMarkdown(container: HTMLElement) {
  return Array.from(container.childNodes)
    .map((child) => nodeToMarkdown(child).trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizePastedHtml(html: string) {
  if (!canUseDom()) {
    return html;
  }

  const container = document.createElement("div");
  container.innerHTML = html;

  container.querySelectorAll("*").forEach((element) => {
    const tag = element.tagName.toLowerCase();
    if (FORBIDDEN_TAGS.has(tag)) {
      element.remove();
      return;
    }

    element.removeAttribute("style");
    Array.from(element.attributes).forEach((attribute) => {
      if (attribute.name.startsWith("on")) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return container.innerHTML;
}

export function processHtml(rawHtml: string): StripHtmlResult {
  if (!canUseDom() || !rawHtml.trim()) {
    return EMPTY_RESULT;
  }

  const container = document.createElement("div");
  container.innerHTML = rawHtml;

  const nodesToRemove: Node[] = [];

  Array.from(container.childNodes).forEach((child) => {
    const cleaned = cleanNode(child);
    if (cleaned === null) {
      nodesToRemove.push(child);
    } else if (cleaned !== child) {
      container.replaceChild(cleaned, child);
    }
  });

  nodesToRemove.forEach((child) => container.removeChild(child));

  const pretty = Array.from(container.childNodes)
    .map((child) => prettyPrint(child, 0))
    .filter((value) => value.trim() !== "")
    .join("\n");

  const markdown = convertToMarkdown(container);
  const minified = minifyHtml(pretty);

  return {
    pretty,
    minified,
    markdown,
    status: pretty ? "ready" : "idle",
    charCount: pretty.length,
    nodeCount: container.querySelectorAll("*").length,
  };
}

export function buildPreviewDocument(html: string) {
  return `${PREVIEW_STYLES}${html}`;
}
