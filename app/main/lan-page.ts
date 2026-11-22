import naclSource from 'tweetnacl/nacl-fast.min.js?raw';

/**
 * The page a paired device opens (docs/plan-1.5.md E1, E4). Plain HTML with tweetnacl inline: it takes the device's id
 * and key from the address's #fragment, keeps them in this browser, drops them from the address bar, proves the key once
 * (/pair) and then asks for what goes on in the shop (/poll), every message sealed with the key. On top, what waits for
 * an answer, with a button per option (/answer); a serious step only says to answer it at the computer. Below, a line for
 * each thing that happened, newest first, like the caption log.
 */
export type LanWords = {
  title: string; connected: string; pairing: string; refused: string; noKey: string;
  asks: string; serious: string; remind: string; waiting: string;
};

const ENGLISH: LanWords = {
  title: 'Lamplight Nook',
  connected: 'Connected to the shop.',
  pairing: 'Pairing…',
  refused: 'The shop does not know this device any more. Pair it again on the computer.',
  noKey: 'Open this page from the QR code on the computer.',
  asks: 'Waiting for you',
  serious: 'Answer this one at the computer.',
  remind: 'While this page is open, it tells you when something is asked. Closed, it cannot.',
  waiting: 'A question for you',
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The shop's paper and ink, as in the app's cards. The two icons are drawn here, a tick and a cross.
const STYLE = `
body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:16px;background:#f6ecd8;color:#3b2a1e}
h1{font-size:24px;margin:0 0 8px}h2{font-size:17px;margin:16px 0 8px}
#state{font-weight:600;margin:0 0 4px}.remind{font-size:13px;color:#7a6450;margin:0}
#asks{list-style:none;padding:0;margin:0}
#asks li{background:#fbf5e8;border:2px solid #8a6a4a;border-radius:6px;padding:12px;margin:0 0 10px}
#asks .why{font-size:14px;color:#6a5440;margin:4px 0 0}#asks .here{font-size:14px;font-weight:600;color:#8a3a2a;margin:8px 0 0}
#asks .buttons{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
#asks button{font:inherit;min-height:44px;padding:6px 14px;border:2px solid #8a6a4a;border-radius:6px;background:#f6ecd8;color:#3b2a1e;display:inline-flex;align-items:center;gap:6px}
#asks button.allow{background:#e3ecd2}#asks button.deny{background:#f1dcd2}#asks button:disabled{opacity:.5}
#asks svg{width:16px;height:16px;stroke:currentColor;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round}
#events{list-style:none;padding:0;margin:12px 0 0}#events li{padding:6px 0;border-bottom:1px solid #e0cfae}`;

export function lanPage(words: LanWords = ENGLISH): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(words.title)}</title>
<style>${STYLE}</style>
</head><body><h1>${escape(words.title)}</h1><p id="state"></p><p class="remind">${escape(words.remind)}</p>
<section id="asking" hidden><h2>${escape(words.asks)}</h2><ul id="asks"></ul></section>
<ul id="events"></ul>
<script>${naclSource}</script>
<script>
(function () {
  var W = ${JSON.stringify(words)};
  var ICON = {
    allow: '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5"/></svg>',
    deny: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>'
  };
  var state = document.getElementById('state'), list = document.getElementById('events');
  var asking = document.getElementById('asking'), asks = document.getElementById('asks');
  var p = new URLSearchParams(location.hash.slice(1));
  if (p.get('d') && p.get('k')) {
    localStorage.setItem('nook', JSON.stringify({ id: p.get('d'), key: p.get('k'), c: 0, paired: false }));
    history.replaceState(null, '', location.pathname);
  }
  var me = JSON.parse(localStorage.getItem('nook') || 'null');
  if (!me) { state.textContent = W.noKey; return; }
  var key = Uint8Array.from(atob(me.key), function (c) { return c.charCodeAt(0); });
  var b64 = function (u) { var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
  var unb64 = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  function seal(msg) {
    me.c += 1; localStorage.setItem('nook', JSON.stringify(me));
    msg.c = me.c;
    var n = nacl.randomBytes(24);
    return JSON.stringify({ id: me.id, n: b64(n), b: b64(nacl.secretbox(new TextEncoder().encode(JSON.stringify(msg)), n, key)) });
  }
  function unseal(text) {
    var o = JSON.parse(text);
    return JSON.parse(new TextDecoder().decode(nacl.secretbox.open(unb64(o.b), unb64(o.n), key)));
  }
  function post(path, msg) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: seal(msg) }).then(function (r) {
      if (!r.ok) throw r.status;
      return r.text().then(unseal);
    });
  }
  function line(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; }

  // What waits for an answer. A new one changes the tab's title and, where the phone can, buzzes once:
  // a page on the home network may not show notifications, which need HTTPS.
  var seen = {};
  function showAsks(all) {
    var fresh = false;
    asks.textContent = '';
    all.forEach(function (a) {
      if (!seen[a.id]) { seen[a.id] = true; fresh = true; }
      var li = document.createElement('li');
      li.dataset.ask = a.id;
      li.dataset.kind = a.kind;
      li.appendChild(line('div', 'what', a.title));
      if (a.reason) li.appendChild(line('p', 'why', a.reason));
      if (a.kind === 'serious') { li.appendChild(line('p', 'here', W.serious)); asks.appendChild(li); return; }
      var row = document.createElement('div');
      row.className = 'buttons';
      a.options.forEach(function (o) {
        var b = document.createElement('button');
        b.dataset.choice = o.id;
        if (ICON[o.id]) { b.className = o.id; b.innerHTML = ICON[o.id]; }
        b.appendChild(document.createTextNode(o.label));
        b.onclick = function () {
          row.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
          post('/answer', { id: a.id, choice: o.id }).then(function () { li.remove(); if (!asks.children.length) asking.hidden = true; },
            function () { row.querySelectorAll('button').forEach(function (x) { x.disabled = false; }); });
        };
        row.appendChild(b);
      });
      li.appendChild(row);
      asks.appendChild(li);
    });
    asking.hidden = all.length === 0;
    document.title = all.length ? W.waiting + ' · ' + W.title : W.title;
    if (fresh && navigator.vibrate) navigator.vibrate(200);
  }

  var after = 0, version = -1;
  function poll() {
    post('/poll', { after: after, asks: version }).then(function (got) {
      state.textContent = W.connected;
      got.events.forEach(function (e) {
        list.prepend(line('li', '', e.plain));
        while (list.children.length > 100) list.lastChild.remove();
      });
      if (got.version !== version) showAsks(got.asks);
      after = got.next;
      version = got.version;
      poll();
    }, function (status) {
      if (status === 403) { state.textContent = W.refused; asking.hidden = true; return; }
      setTimeout(poll, 3000);
    });
  }
  if (me.paired) return poll();
  state.textContent = W.pairing;
  post('/pair', {}).then(function () { me.paired = true; localStorage.setItem('nook', JSON.stringify(me)); state.textContent = W.connected; poll(); }, function () { state.textContent = W.refused; });
})();
</script></body></html>`;
}
