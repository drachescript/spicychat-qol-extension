// Regression checks for durable Bot Status pending/recheck queue.
// Run: node build/test-bot-status-queue.js
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..');
const status = fs.readFileSync(path.join(root, 'settings/features/options-bot-status.js'), 'utf8');
const archive = fs.readFileSync(path.join(root, 'settings/features/options-bot-archive.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'options.html'), 'utf8');
function extractFunction(source, name) {
  const begin = source.indexOf(`async function ${name}(`);
  assert(begin >= 0, `${name} missing`);
  let depth = 0, start = source.indexOf('{', begin);
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(begin, i + 1);
    // Note: this simple lexical scan is fine for these specific functions only.
  }
  throw Error(`Unterminated function ${name}`);
}
// Avoid lexical brace matcher for the large scanning function (it has strings
// with templates). Evaluate the source as a whole in a sandbox on-demand.
const tests = async () => {
  const ids = Array.from({length: 890}, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12,'0')}`);
  const state = {ids, phase:'paused', mode:'all', scope:'all'};
  const controls = {
    resumePausedBotAvailability:{disabled:false, hidden:true, textContent:''},
    botStatusPendingQueueSummary:{textContent:''},
  };
  const ctx = vm.createContext({
    storageGet: async () => ({ botStatusPendingQueueV1: state }),
    BOT_STATUS_PAUSED_QUEUE_KEY:'botStatusPendingQueueV1',
    validBotId: id => /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id),
    botAvailabilityScanRunning:false,
    $: id => controls[id],
    console,
    Set,
  });
  const extracted = `let botStatusPendingReviewIds = new Set();\n${extractFunction(status,'botStatusPausedQueue')}\n${extractFunction(status,'refreshBotStatusPauseButton')}`;
  vm.runInContext(extracted, ctx);
  await vm.runInContext('refreshBotStatusPauseButton()', ctx);
  assert(ctx.botStatusPendingReviewIds === undefined); // top-level lexical binding
  assert.strictEqual(controls.resumePausedBotAvailability.hidden, false);
  assert.match(controls.resumePausedBotAvailability.textContent, /890/);
  assert.match(controls.botStatusPendingQueueSummary.textContent, /890 IDs/);
  assert.match(status, /if \(unfinished\?\.ids\?\.length\)/);
  assert(!status.includes('Start a new scan and replace that resume queue?'));
  assert.match(status, /scopeForReview = statusFilter === "pending" \? "all" : scope/);
  assert.match(status, /for \(const id of botStatusPendingReviewIds\)/);
  assert.match(status, /\.\.\.unresolvablePendingIds/);
  assert.match(archive, /filter === "pending"/);
  assert.match(html, /<option value="pending">Pending recheck/);
  // Stale recorded state is not zeroed when a recheck is pending.
  assert.match(status, /checkedAt: Number\(history\.checkedAt \|\| 0\)/);
  console.log('PASS: 890-item pending queue display, preservation guard, filtering, out-of-scope recovery and previous status retention');
};
tests().catch(e => {console.error(e); process.exit(1);});
