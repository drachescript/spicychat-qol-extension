'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../content/soundscapes.js'), 'utf8');
const listeners = new Set();
let reads = 0;
const settings = { enabled: true, enableSoundscapes: false };
const DS = {
  state: { settings },
  storageGet: async () => { reads++; return {}; },
  isSingleChatPage: () => false,
  isHomePage: () => false,
  isChatListPage: () => false,
  isBotProfilePage: () => false,
  isLorebookPage: () => false,
  updateQuickPanel: () => {}
};
const document = { querySelectorAll: () => [], querySelector: () => null };
const chrome = { storage: { onChanged: {
  addListener: fn => { assert(!listeners.has(fn)); listeners.add(fn); },
  removeListener: fn => { assert(listeners.has(fn)); listeners.delete(fn); }
} } };
const ctx = { window: { DragonScriptQoL: DS }, document, chrome, setTimeout, clearTimeout, setInterval, clearInterval };
vm.runInNewContext(source, ctx, {filename:'soundscapes.js'});
(async () => {
  assert.equal(listeners.size, 0, 'OFF soundscape should not register storage listener at script load');
  await DS.applySoundscapes();
  assert.equal(reads, 0, 'OFF soundscape should not fetch audio library');
  assert.equal(listeners.size, 0);
  settings.enableSoundscapes = true;
  await DS.applySoundscapes();
  await DS.applySoundscapes();
  assert.equal(reads, 1, 'scene store only fetched once');
  assert.equal(listeners.size, 1, 'one storage listener while enabled');
  settings.enableSoundscapes = false;
  await DS.removeSoundscapes();
  assert.equal(listeners.size, 0, 'storage listener removed on disable');
  await DS.applySoundscapes();
  assert.equal(reads, 1, 'OFF should not refetch audio');
  assert.equal(listeners.size, 0);
  settings.enableSoundscapes = true;
  await DS.applySoundscapes();
  assert.equal(listeners.size, 1, 'listener reinstalled on re-enable');
  await DS.removeSoundscapes();
  assert.equal(listeners.size, 0, 'no storage listener after cleanup');
  console.log('PASS: Soundscapes dormant when OFF, subscriptions attach/detach, state loaded once');
})().catch(err => { console.error(err); process.exitCode = 1; });
