"use strict";
// Static boundary check; actual disappearance/recovery behavior needs browser
// observation because SpicyChat owns the DOM and React lifecycle.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const observer = fs.readFileSync("content/main-page-observer.js", "utf8");
assert(observer.includes('sessionStorage.setItem(CHAT_VISIBILITY_DIAGNOSTIC_KEY'));
assert(observer.includes('sessionStorage.getItem(CHAT_VISIBILITY_DIAGNOSTIC_KEY)'));
for(const name of ['chatUnexpectedEmptyTransitions','chatUnexpectedEmptyRecovered','chatUnexpectedEmptyUnresolved','chatUnexpectedEmptyLastBefore','chatUnexpectedEmptyLastGeneration'])
  assert(observer.includes(name), `${name} missing`);
assert(observer.includes('document.querySelectorAll("div[id^=\'message-\']").length'));
assert(!observer.includes('location.reload()'));
assert(!observer.includes('innerText'));
console.log("Chat visibility trace privacy and session continuity: PASS");
