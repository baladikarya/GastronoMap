'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('PWA JS parses, its lifecycle is unique, and HTML uses shared styles', () => {
  const sw = read('service-worker.js');
  const ui = read('assets/js/pwa.js');
  const html = read('index.html');
  assert.doesNotThrow(() => new Function(sw));
  assert.doesNotThrow(() => new Function(ui));
  assert.doesNotThrow(() => new Function(read('assets/js/events.js')));
  assert.doesNotMatch(read('assets/js/events.js'), /serviceWorker\.register/);
  assert.match(html, /assets\/css\/pwa\.css/);
  assert.match(html, /assets\/js\/pwa\.js/);
  for (const id of ['pwaOfflineBanner', 'pwaUpdateBanner', 'pwaInstallBanner',
    'pwaUpdateNowBtn', 'pwaRetryBtn', 'pwaInstallNowBannerBtn']) {
    assert.ok(html.includes('id="' + id + '"'), id + ' UI missing');
  }
  assert.match(ui, /window\.confirm/);
  assert.match(ui, /beforeinstallprompt/);
  assert.match(ui, /appinstalled/);
  assert.match(ui, /controllerchange/);
});

test('manifest icon size matches PNG bytes and new maskable icon has padding', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const html = read('index.html');
  assert.equal(manifest.id, './index.html');
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.theme_color, '#16382A');
  assert.ok(html.includes('name="theme-color" content="' + manifest.theme_color + '"'));
  for (const icon of manifest.icons.filter(icon => icon.type === 'image/png')) {
    const binary = fs.readFileSync(path.join(root, icon.src));
    assert.equal(binary.toString('ascii', 1, 4), 'PNG');
    assert.equal(icon.sizes, binary.readUInt32BE(16) + 'x' + binary.readUInt32BE(20));
  }
  const mask = manifest.icons.find(icon => icon.purpose === 'maskable');
  assert.equal(mask.type, 'image/svg+xml');
  assert.match(read(mask.src), /<image x="112" y="112" width="288" height="288"/);
});

test('precache includes every local linked script/style and shell assets', () => {
  const sw = read('service-worker.js');
  const html = read('index.html');
  const paths = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g)]
    .map(match => match[1]).filter(file => !file.startsWith('http'));
  for (const asset of paths) assert.ok(sw.includes("'./" + asset + "'"), asset + ' not precached');
  for (const file of ['manifest.json', 'icons/icon-maskable.svg', 'icons/icon-180.png']) {
    assert.ok(sw.includes("'./" + file + "'"));
  }
  assert.doesNotMatch(sw, /caches\.open\([^)]*supabase/i);
  assert.match(sw, /CDN_URLS\.has\(url\.href\)/);
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /SHELL_PATHS\.has\(url\.pathname\)/);
});

test('service worker waits for consent, only clears owned caches and serves offline app shell', async () => {
  const handlers = {};
  const deleted = [];
  const calls = {skip:0,claim:0,added:[]};
  const shellResponse = new Response('offline app shell', {status:200});
  const fakeCache = {
    addAll: async files => {calls.added.push(...files);},
    put: async () => {},
    match: async request => String(request).includes('index.html') ? shellResponse.clone() : null
  };
  const cachesMock = {
    open: async () => fakeCache,
    keys: async () => ['other-app-cache', 'gastronomap-v151', 'gastronomap-shell-outdated', 'gastronomap-shell-p2-14-20261013-1'],
    delete: async key => {deleted.push(key); return true;}
  };
  const scope = 'https://example.test/GastronoMap/';
  const context = {
    self: {
      registration: {scope},
      location: {origin:'https://example.test'},
      clients: {claim: async () => {calls.claim++;}},
      skipWaiting: () => {calls.skip++;},
      addEventListener: (event, fn) => {handlers[event] = fn;}
    },
    caches:cachesMock, URL, Request, Response, Promise, Set,
    fetch: async request => new Response('cdn', {status:200})
  };
  vm.runInNewContext(read('service-worker.js'), context);
  const installWait = [];
  handlers.install({waitUntil: promise => installWait.push(promise)});
  await Promise.all(installWait);
  assert.equal(calls.skip, 0, 'updates must not self-activate');
  assert.ok(calls.added.some(request => request.url.endsWith('/assets/js/pwa.js')));
  const activation = [];
  handlers.activate({waitUntil: promise => activation.push(promise)});
  await Promise.all(activation);
  assert.equal(calls.claim, 1);
  assert.deepEqual(deleted.sort(), ['gastronomap-shell-outdated','gastronomap-v151'].sort());
  handlers.message({data:{type:'IGNORED'}});
  assert.equal(calls.skip, 0);
  handlers.message({data:{type:'SKIP_WAITING'}});
  assert.equal(calls.skip, 1);
  let response;
  handlers.fetch({
    request: {method:'GET',mode:'navigate',url:scope},
    respondWith: promise => {response = promise;},
    waitUntil: () => {}
  });
  assert.equal(await (await response).text(), 'offline app shell');
  let intercepted = false;
  handlers.fetch({
    request:{method:'GET',mode:'cors',url:'https://example.supabase.co/rest/v1/posts'},
    respondWith:() => {intercepted = true;},
    waitUntil:() => {}
  });
  assert.equal(intercepted, false, 'API calls must pass through');
});
