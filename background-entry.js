"use strict";

// Keep the large background worker intact and layer small, isolated worker
// normalizers after it. Classic extension service workers share one global scope,
// so the guard can wrap runBotStatusHelperCheck without duplicating background.js.
importScripts("background.js");
importScripts("background-bot-status-guard.js");
