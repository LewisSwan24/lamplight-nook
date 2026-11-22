import naclSource from 'tweetnacl/nacl-fast.min.js?raw';

/**
 * The page a paired device opens (docs/plan-1.5.md E1; E4 makes it the real phone page). Plain HTML with tweetnacl inline:
 * it takes the device's id and key from the address's #fragment, keeps them in this browser, drops them from the address
 * bar, proves the key once (/pair) and then asks for what goes on in the shop (/poll), every message sealed with the key.
 */
export type LanWords = { title: string; connected: string; pairing: string; refused: string; noKey: string };

const ENGLISH: LanWords = {
  title: 'Lamplight Nook',
  connected: 'Connected to the shop.',
  pairing: 'Pairing…',
  refused: 'The shop does not know this device any more. Pair it again on the computer.',
  noKey: 'Open this page from the QR code on the computer.',
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function lanPage(words: LanWords = ENGLISH): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(words.title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:16px;background:#f6ecd8;color:#3b2a1e}#state{font-weight:600}#events{list-style:none;padding:0}#events li{padding:6px 0;border-bottom:1px solid #e0cfae}</style>
</head><body><h1>${escape(words.title)}</h1><p id="state"></p><ul id="events"></ul>
<script>${naclSource}</script>
<script>
(function () {
  var W = ${JSON.stringify(words)};
  var state = document.getElementById('state'), list = document.getElementById('events');
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
  var after = 0;
  function poll() {
    post('/poll', { after: after }).then(function (got) {
      state.textContent = W.connected;
      got.events.forEach(function (e) { var li = document.createElement('li'); li.textContent = e.plain; list.prepend(li); });
      after = got.next;
      poll();
    }, function (status) {
      if (status === 403) { state.textContent = W.refused; return; }
      setTimeout(poll, 3000);
    });
  }
  if (me.paired) return poll();
  state.textContent = W.pairing;
  post('/pair', {}).then(function () { me.paired = true; localStorage.setItem('nook', JSON.stringify(me)); state.textContent = W.connected; poll(); }, function () { state.textContent = W.refused; });
})();
</script></body></html>`;
}
