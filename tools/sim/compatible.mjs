// A stand-in for a service with an Anthropic-compatible API (plan-1.6.md F7), on this computer, for the `provider`
// scenario. It answers the Messages endpoint only: the right key and model get a one-token reply, a wrong key 401, a model
// it does not know a 400 that names the model, as the real services do. Every request is written down, headers included.
import { createServer } from 'node:http';

export function startCompatible({ key, model }) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let json = {};
      try { json = JSON.parse(body || '{}'); } catch { /* not JSON: answered below as a bad request */ }
      requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization ?? '', apiKey: req.headers['x-api-key'] ?? '', model: json.model });
      const send = (status, o) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.method !== 'POST' || !/\/v1\/messages$/.test(req.url ?? '')) return send(404, { error: { type: 'not_found_error', message: 'Not Found' } });
      if (req.headers.authorization !== `Bearer ${key}` && req.headers['x-api-key'] !== key) return send(401, { error: { type: 'authentication_error', message: 'invalid key' } });
      if (json.model !== model) return send(400, { error: { type: 'invalid_request_error', message: `Model Not Exist: ${json.model}` } });
      send(200, { id: 'msg_compat', type: 'message', role: 'assistant', model, content: [{ type: 'text', text: 'h' }], stop_reason: 'max_tokens', usage: { input_tokens: 8, output_tokens: 1 } });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((r) => server.close(r)),
  })));
}
