"use strict";
// Existing background.js contains the Bot Status helper timeouts, heartbeat
// checks, and backoff logic. The supplied 0.2.42 package referenced an
// absent optional guard script; loading it would prevent this worker starting.
importScripts("background.js");
