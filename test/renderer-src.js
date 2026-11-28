// renderer-src.js — 시험이 읽는 렌더러 코드. v1.0.43 부터 스크립트는 renderer/app.js 에 있다.
//   file 을 주면(TT_RENDERER 재현용 옛 index.html) 그 안의 인라인 <script> 를 쓰고, 아니면 app.js 를 읽는다.
"use strict";
const fs = require("fs"), path = require("path");
module.exports = function rendererSrc(file) {
  if (file) {
    const html = fs.readFileSync(file, "utf8");
    const open = html.indexOf("<script>"), close = html.lastIndexOf("</script>");
    if (open >= 0 && close > open) return html.slice(open + "<script>".length, close);
    return fs.readFileSync(path.join(path.dirname(file), "app.js"), "utf8");
  }
  return fs.readFileSync(path.join(__dirname, "..", "renderer", "app.js"), "utf8");
};
