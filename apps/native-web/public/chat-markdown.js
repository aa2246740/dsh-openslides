function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

const HR = /^(-{3,}|\*{3,}|_{3,})$/;
const HEADING = /^(#{1,4})\s+(.+)$/;
const UL = /^[-*•]\s+(.+)$/;
const OL = /^(\d{1,3})[、.．)]\s*(.+)$/, OL_SOURCE = OL;

/** Small safe block parser so assistant copy reads like chat, not a code dump. */
export function renderChatMarkdown(source) {
  const text = String(source || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const lines = text.split("\n");
  const html = [];
  let paragraph = [];
  let list = null;
  let ordered = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    html.push(ordered ? `<ol>${list.join("")}</ol>` : `<ul>${list.join("")}</ul>`);
    list = null;
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (HR.test(line)) {
      flushAll();
      html.push("<hr>");
      continue;
    }
    const fence = /^```/.test(line);
    if (fence) {
      flushAll();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const cells = (value) => value.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
    const divider = lines[index + 1]?.trim() || "";
    if (line.includes("|") && divider.includes("|") && cells(divider).every(cell => /^:?-{3,}:?$/.test(cell))) {
      flushAll();
      const headers = cells(line);
      const body = [];
      index += 2;
      while (index < lines.length && lines[index].trim().includes("|")) {
        const row = cells(lines[index]);
        body.push(`<tr>${headers.map((_, col) => `<td>${inline(row[col] || "")}</td>`).join("")}</tr>`);
        index += 1;
      }
      index -= 1;
      html.push(`<div class="md-table-wrap"><table><thead><tr>${headers.map(cell => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${body.join("")}</tbody></table></div>`);
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(4, heading[1].length + 1);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const orderedItem = OL.exec(line);
    if (orderedItem) {
      flushParagraph();
      if (list && !ordered) flushList();
      ordered = true;
      list = list || [];
      list.push(`<li>${inline(orderedItem[2])}</li>`);
      continue;
    }
    const unorderedItem = UL.exec(line);
    if (unorderedItem) {
      flushParagraph();
      if (list && ordered) flushList();
      ordered = false;
      list = list || [];
      list.push(`<li>${inline(unorderedItem[1])}</li>`);
      continue;
    }
    if (!line) {
      flushAll();
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushAll();
  return html.join("");
}
