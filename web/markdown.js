"use strict";
// 아주 작은 마크다운 -> HTML 변환기. 빌드 도구 없는 프로젝트라 라이브러리 대신 직접 짰다.
// web/app.html, web/popup.html이 <script src="markdown.js">로 그대로 공유해서 쓴다.
//
// 안전 원칙: 전체를 먼저 HTML 이스케이프한 다음, 우리가 지원하는 마크다운 문법만
// 안전한 태그로 바꾼다. PROMPTS.md가 AI에게 직접 <details><summary>...</summary>...</details>를
// 문자 그대로 출력하라고 지시하므로, 그 네 태그만 이스케이프를 되돌려 살린다.
// 그 외의 <, >는 전부 화면에 문자 그대로 보인다 - AI 응답에 스크립트 태그가 섞여 들어와도 무해하다.

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMarkdown(s) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderMarkdown(raw) {
  let text = escapeHtml(String(raw == null ? "" : raw));

  // PROMPTS.md 지시로 AI가 직접 내보내는 4개 태그만 허용한다.
  text = text
    .replace(/&lt;details&gt;/g, "<details>")
    .replace(/&lt;\/details&gt;/g, "</details>")
    .replace(/&lt;summary&gt;/g, "<summary>")
    .replace(/&lt;\/summary&gt;/g, "</summary>");

  // 펜스 코드 블록을 먼저 떼어내 다른 규칙이 안의 텍스트를 안 건드리게 한다.
  // 플레이스홀더는 일반 텍스트에 나올 일이 없는 고유 토큰으로 감싼다.
  var codeBlocks = [];
  text = text.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, function (_, code) {
    codeBlocks.push('<pre class="md-code"><code>' + code.replace(/\n$/, "") + "</code></pre>");
    return "%%CODEBLOCK" + (codeBlocks.length - 1) + "%%";
  });

  var lines = text.split("\n");
  var out = [];
  var list = null; // { type: "ul" | "ol", items: string[] }
  var para = [];
  var table = null; // { header: string[], rows: string[][] }

  function flushPara() {
    if (para.length) { out.push("<p>" + inlineMarkdown(para.join(" ")) + "</p>"); para = []; }
  }
  function flushList() {
    if (!list) return;
    var items = list.items.map(function (i) { return "<li>" + inlineMarkdown(i) + "</li>"; }).join("");
    out.push("<" + list.type + ">" + items + "</" + list.type + ">");
    list = null;
  }
  function flushTable() {
    if (!table) return;
    var head = "<tr>" + table.header.map(function (c) { return "<th>" + inlineMarkdown(c) + "</th>"; }).join("") + "</tr>";
    var body = table.rows.map(function (r) {
      return "<tr>" + r.map(function (c) { return "<td>" + inlineMarkdown(c) + "</td>"; }).join("") + "</tr>";
    }).join("");
    out.push('<table class="md-table"><thead>' + head + "</thead><tbody>" + body + "</tbody></table>");
    table = null;
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();

    var codePlaceholder = trimmed.match(/^%%CODEBLOCK(\d+)%%$/);
    if (codePlaceholder) {
      flushPara(); flushList(); flushTable();
      out.push(codeBlocks[Number(codePlaceholder[1])]);
      continue;
    }

    var heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushPara(); flushList(); flushTable();
      var level = heading[1].length + 2; // h3~h5 - 채팅 말풍선 안에서 과하게 커지지 않도록
      out.push("<h" + level + ">" + inlineMarkdown(heading[2]) + "</h" + level + ">");
      continue;
    }

    var tableRow = line.match(/^\|(.+)\|\s*$/);
    if (tableRow) {
      var cells = tableRow[1].split("|").map(function (c) { return c.trim(); });
      if (cells.every(function (c) { return /^-+$/.test(c); })) continue; // 헤더 구분선(---|---) 행은 건너뜀
      flushPara(); flushList();
      if (!table) table = { header: cells, rows: [] };
      else table.rows.push(cells);
      continue;
    }
    if (table) flushTable();

    var ulItem = line.match(/^[-*]\s+(.*)$/);
    if (ulItem) {
      flushPara();
      if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
      list.items.push(ulItem[1]);
      continue;
    }
    var olItem = line.match(/^\d+\.\s+(.*)$/);
    if (olItem) {
      flushPara();
      if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
      list.items.push(olItem[1]);
      continue;
    }
    if (list) flushList();

    if (trimmed === "") { flushPara(); continue; }

    // <details>/<summary> 태그가 낀 줄은 단락으로 안 감싸고 그대로 통과시킨다.
    if (/^<\/?(details|summary)>/.test(trimmed) || /<\/?(details|summary)>$/.test(trimmed)) {
      flushPara();
      out.push(inlineMarkdown(line));
      continue;
    }

    para.push(trimmed);
  }
  flushPara(); flushList(); flushTable();

  return out.join("\n");
}
