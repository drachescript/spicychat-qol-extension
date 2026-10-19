'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function loadHistory(initial = {}) {
  const store = { ...initial };
  const calls = [];
  const c = {
    console, Date, Map, Promise,
    QUICK_DISLIKE_HISTORY_KEY: 'dislike',
    QUICK_LESS_LIKE_HISTORY_KEY: 'lesslike',
    QUICK_LESS_LIKE_PENDING_KEY: 'pending',
    QUICK_LESS_LIKE_HISTORY_FLUSH_EVERY: 25,
    QUICK_LESS_LIKE_HISTORY_FLUSH_MAX_AGE_MS: 30000,
    recommendationFeedbackQuickDislikeCache: null,
    recommendationFeedbackQuickLessLikeCache: null,
    recommendationFeedbackBotChains: new Map(),
    quickLessLikeHistoryCacheRunId: '',
    quickLessLikeHistoryCache: null,
    quickLessLikePendingCache: null,
    quickLessLikeHistoryLastFlushAt: 0,
    storageGet: async keys => Object.fromEntries(keys.map(key => [key, store[key]])),
    storageSet: async value => Object.assign(store, value),
    feedbackUnavailableSuperseded: async () => false,
    releaseQuickLessLikeStandaloneWorker: async () => {},
    recordHelperLifecycle: async () => {},
    isQuickDislikeBulkRunCanceled: () => false,
    runDirectCharacterFeedback: async (msg, mode) => {
      calls.push({ msg, mode });
      return { ok: true, status: 'disliked', nativeEventConfirmed: true, requestSent: !msg.eventOnly };
    }
  };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root, 'background/features/background-feedback-history.js'), 'utf8'), c);
  return { c, store, calls };
}

async function main() {
  const legacy = { [ID]: { status: 'already-disliked', crossHandledBy: 'less-like', ratingSource: 'less-like', handledAt: 1 } };
  const {c,store,calls} = loadHistory({
    dislike: { version: 1, bots: legacy },
    lesslike: { version: 1, bots: { [ID]: { status: 'less-liked', handledAt: 1 } } }
  });
  const first = await vm.runInContext(`runQuickDislikeBot({ botId: '${ID}', botName: 'Test' })`, c);
  assert.equal(first.status, 'disliked');
  assert.equal(calls.length, 1, 'Less Like must not skip actual Dislike');
  assert.equal(calls[0].msg.eventOnly, false, 'legacy Less Like may not imply native Dislike event partially completed');
  assert.equal(store.dislike.bots[ID].nativeEventConfirmed, true);
  const second = await vm.runInContext(`runQuickDislikeBot({ botId: '${ID}', botName: 'Test' })`, c);
  assert.equal(second.status, 'already-handled');
  assert.equal(calls.length, 1, 'confirmed Dislike should skip repeat');

  const pending = loadHistory({ dislike: { version: 1, bots: { [ID]: { status: 'dislike-event-pending', handledAt: 1 } } } });
  await vm.runInContext(`runQuickDislikeBot({ botId: '${ID}', botName: 'Test' })`, pending.c);
  assert.equal(pending.calls.length, 1);
  assert.equal(pending.calls[0].msg.eventOnly, true, 'pending event retry must not re-submit recommendation rating');
  assert.equal(pending.store.dislike.bots[ID].nativeEventConfirmed, true);

  const pseudo = loadHistory({lesslike:{version:1,bots:{[ID]: {status:'less-liked',stage:'cross-feedback-dedupe',handledAt:1}}}});
  const cleaned = await vm.runInContext('getQuickLessLikeHistory()', pseudo.c);
  assert.equal(cleaned.bots[ID], undefined, 'legacy faux Less Like success must not block native Less Like');

  const options = { console, Date, quickDislikeHistoryState: {bots: legacy}, quickLessLikeHistoryState:{bots:{}},botAvailabilityState:{meta:{}} };
  vm.createContext(options);
  vm.runInContext(fs.readFileSync(path.join(root, 'settings/features/options-bot-archive.js'), 'utf8'), options);
  assert.equal(vm.runInContext(`quickDislikeHistoryEntry('${ID}')`,options),null,
    'legacy cross-completed Dislike is not verified');
  options.quickDislikeHistoryState.bots[ID] = { status:'disliked', nativeEventConfirmed:true, handledAt:2 };
  assert.equal(vm.runInContext(`quickDislikeHistoryEntry('${ID}')?.status`,options),'disliked');
  console.log('PASS: independent rating actions, verified Dislike ledger, event-only repair, legacy migration');
}
main().catch(e => { console.error(e);process.exitCode=1; });

// Smoke-test the captured native characterRating request without touching
// user data or making live network calls. This runs independently from main().
(async () => {
  const source = fs.readFileSync(path.join(root, 'content/card-token-main.js'), 'utf8');
  const a = source.indexOf('  async function postNativeCharacterRatingEvent(botId) {');
  const b = source.indexOf('\n  window.addEventListener(FEEDBACK_REQUEST_EVENT', a);
  assert.ok(a !== -1 && b > a);
  const seen = [];
  const sandbox = {
    console,
    clean: v => String(v || '').trim(),
    capturedAppVersion: '4.6.0', capturedCountry: 'US', capturedGuest: 'test-guest', capturedToken: '',
    document: { querySelector: () => null },
    isGuest: v => !!v, isJwt: () => false,
    MAX_TOKEN: 12000,
    nativeFetch: async (url, init) => {
      seen.push({url, init});
      return {ok:true,status:200};
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(source.slice(a,b) + '\nthis.postNativeCharacterRatingEvent = postNativeCharacterRatingEvent;',sandbox);
  const result = await sandbox.postNativeCharacterRatingEvent(ID);
  assert.equal(result.status, 'disliked');
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,'https://prod.nd-api.com/event');
  assert.equal(seen[0].init.credentials,'include');
  assert.equal(seen[0].init.headers['x-app-id'],'spicychat');
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    event_name: 'characterRating', character_id: ID, rating: 1, conversation_length: 0
  });
  console.log('PASS: native characterRating request shape');
})().catch(e => {console.error(e);process.exitCode=1;});
