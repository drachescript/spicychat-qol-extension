const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const { webcrypto } = require('crypto');
const root = path.resolve(__dirname, '..');

(async () => {
  const defaultsText = fs.readFileSync(path.join(root, 'settings/options-settings-defaults.js'), 'utf8');
  const contentDefaults = fs.readFileSync(path.join(root, 'content/core-settings-defaults.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'options.html'), 'utf8');
  const changelog = (fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').split('## 0.2.60')[1] || '').split('## 0.2.59')[0];
  const enabled = ['lorebookJsonPrivateAutoCreate','lorebookJsonAutoImportEntries','lorebookJsonCopyCover','lorebookJsonCopyTags'];
  const disabled = ['lorebookJsonPreferSelectedCover','lorebookJsonAllowPlaceholderCover'];
  for (const key of enabled) {
    assert.match(defaultsText, new RegExp(`\\b${key}: true\\b`));
    assert.match(contentDefaults, new RegExp(`\\b${key}: true\\b`));
  }
  for (const key of disabled) {
    assert.match(defaultsText, new RegExp(`\\b${key}: false\\b`));
    assert.match(contentDefaults, new RegExp(`\\b${key}: false\\b`));
  }
  for (const key of [...enabled, ...disabled]) {
    assert.strictEqual((html.match(new RegExp(`id="${key}"`, 'g')) || []).length, 1, `missing/duplicated ${key}`);
  }
  assert.doesNotMatch(html, /\son(?:error|load|click)="/, 'CSP-incompatible inline handler');
  assert.doesNotMatch(changelog, /^- (?:Fixed|Corrected|Resolved) /gmi, 'Release contains in-development fixes');
  assert.ok(changelog.split('\n').filter(x => x.startsWith('- ')).length <= 9);

  const ui = Object.create(null);
  const win = { __DSQ_FEATURE_SETTINGS_READERS__: {}, __DSQ_FEATURE_SETTINGS_LOADERS__: {} };
  const ctx = {
    window: win,
    checked: (key, fallback=false) => key in ui ? ui[key] : fallback,
    setChecked: (key, value) => { ui[key] = value; }
  };
  const panelText = fs.readFileSync(path.join(root, 'settings/feature-panels/lorebook-backup.js'), 'utf8');
  vm.runInNewContext(panelText, ctx);
  for (const key of enabled) {
    win.__DSQ_FEATURE_SETTINGS_LOADERS__[key]({});
    assert.strictEqual(ui[key], true, `older backup should retain enabled ${key}`);
    assert.strictEqual(win.__DSQ_FEATURE_SETTINGS_READERS__[key](), true);
  }
  for (const key of disabled) {
    win.__DSQ_FEATURE_SETTINGS_LOADERS__[key]({});
    assert.strictEqual(ui[key], false, `missing ${key} must default OFF`);
    assert.strictEqual(win.__DSQ_FEATURE_SETTINGS_READERS__[key](), false);
    win.__DSQ_FEATURE_SETTINGS_LOADERS__[key]({[key]:true});
    assert.strictEqual(ui[key], true, `explicit enable should be preserved for ${key}`);
  }

  const source = fs.readFileSync(path.join(root,'content/lorebook-backup.js'),'utf8');
  const start = source.indexOf('const CHANGE_ME_PLACEHOLDER_IMAGE = ');
  const end = source.indexOf('\n  function automaticPlaceholderCoverData()',start);
  const fileFrom = source.slice(source.indexOf('  function fileFromEmbeddedCover('),source.indexOf('\n  function nativeTagField()',source.indexOf('  function fileFromEmbeddedCover(')));
  const hashUpload = source.slice(source.indexOf('  function md5Bytes('),source.indexOf('\n  function validCloneImageKey(',source.indexOf('  function md5Bytes(')));
  assert.ok(start > 0 && end > start && fileFrom && hashUpload, 'cover helper symbols');
  assert.match(source, /const autoCreateNeedsReview = settings\(\)\.lorebookJsonPreferSelectedCover === true;/);
  assert.match(source, /if \(chosenCover\) \{\s+data = await readChosenCover\(chosenCover\);/);
  assert.match(source, /setTimeout\(\(\) => \{\s+try \{\s+if \(routeInfo\(\)\?\.id === info\.id/);
  const runtime={atob,File,Blob,Uint8Array,Array,URL,AbortController,crypto:webcrypto,TextEncoder,DataView,Math,Error,Date,setTimeout,clearTimeout};
  vm.runInNewContext(source.slice(start,end) + '\n' + fileFrom + '\n' + hashUpload + `\n globalThis.__qolTest={data:CHANGE_ME_PLACEHOLDER_IMAGE,from:fileFromEmbeddedCover,upload:signedCloneCoverUpload};`, runtime);
  const image=runtime.__qolTest.from(runtime.__qolTest.data);
  assert.strictEqual(image.type, 'image/png');
  assert.ok(image.size > 100 && image.size < 2*1024*1024);
  const bytes=new Uint8Array(await image.arrayBuffer());
  assert.deepStrictEqual(Array.from(bytes.slice(0,8)), [137,80,78,71,13,10,26,10]);
  const result=await runtime.__qolTest.upload(runtime.__qolTest.data,async (route,method,body)=> {
    assert.strictEqual(route,'/save-image');
    assert.strictEqual(method,'POST');
    assert.strictEqual(body.image_type,'image/png');
    assert.match(body.hash,/^[0-9a-f]{32}$/);
    return { key:'avatars/test-change-me.png',signed_url:'' };
  },()=>{});
  assert.strictEqual(result,'avatars/test-change-me.png');
  console.log('PASS: option defaults, migration of missing settings, CSP markup, changelog policy, valid placeholder bytes, signed cover dedup and import refresh');
})().catch(err => {console.error(err);process.exit(1)});
