import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { inspect } from 'node:util';
import test from 'node:test';
import { getWritingToken } from './writingAuth.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const app = {
  WRITING_GITHUB_APP_ID: '123',
  WRITING_GITHUB_INSTALLATION_ID: '456',
  WRITING_GITHUB_PRIVATE_KEY: privateKey,
};
const noFetch = () => { throw new Error('Authentication must not make a request.'); };
const tokenResponse = () => Response.json({ token: 'installation-token', expires_at: new Date(Date.now() + 3600_000).toISOString(), permissions: { contents: 'read' } });

test('Actions and local tokens are used directly, without requiring app credentials', async () => {
  assert.equal(await getWritingToken({ WRITING_GITHUB_TOKEN: ' local-token\n' }, { fetchImpl: noFetch }), 'local-token');
});

test('missing credentials fail before any request, including a blank token', async () => {
  for (const token of [undefined, '', '  ']) {
    await assert.rejects(getWritingToken({ WRITING_GITHUB_TOKEN: token }, { fetchImpl: noFetch }), /private writing repository needs/);
  }
  await assert.rejects(getWritingToken({ ...app, WRITING_GITHUB_PRIVATE_KEY: '' }, { fetchImpl: noFetch }), /Missing: WRITING_GITHUB_PRIVATE_KEY/);
});

test('invalid tokens and IDs are refused without leaking their values', async () => {
  for (const token of ['secret\nvalue', 'secret value', 'secret한글']) {
    await assert.rejects(getWritingToken({ WRITING_GITHUB_TOKEN: token }, { fetchImpl: noFetch }), (error) => {
      assert.match(error.message, /space, line break, or non-ASCII/);
      assert.equal(inspect(error).includes(token), false);
      return true;
    });
  }
  for (const id of ['0', '-1', '1.5', 'bad', '9007199254740992']) {
    await assert.rejects(getWritingToken({ ...app, WRITING_GITHUB_INSTALLATION_ID: id }, { fetchImpl: noFetch }), /positive integer IDs/);
  }
});

test('the app signs its JWT and requests only read access to the writing repository', async () => {
  let requests = 0;
  const token = await getWritingToken(app, { fetchImpl: async (url, options) => {
    requests += 1;
    assert.equal(url, 'https://api.github.com/app/installations/456/access_tokens');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { repository_ids: [1439376590], permissions: { contents: 'read' } });
    const jwt = options.headers.authorization.split(' ')[1];
    const [header, payload, signature] = jwt.split('.');
    assert.equal(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')), true);
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(String(claims.iss), '123');
    assert.ok(claims.exp > Date.now() / 1000);
    assert.ok(options.signal instanceof AbortSignal);
    return tokenResponse();
  } });
  assert.equal(token, 'installation-token');
  assert.equal(requests, 1);
});

test('GitHub refusals, invalid keys and network errors never expose signing credentials', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (message) => warnings.push(message));
  for (const response of [
    () => Response.json({ message: `secret-server-message ${privateKey}` }, { status: 401 }),
    () => { throw Object.assign(new Error(`secret-network-message ${privateKey}`), { cause: new Error('signed-jwt') }); },
  ]) {
    await assert.rejects(getWritingToken(app, { fetchImpl: response, sleepImpl: async () => {} }), (error) => {
      assert.match(error.message, /Could not authenticate the writing GitHub App/);
      assert.doesNotMatch(inspect(error), /secret-server-message|secret-network-message|signed-jwt|BEGIN RSA PRIVATE KEY/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
  await assert.rejects(getWritingToken({ ...app, WRITING_GITHUB_PRIVATE_KEY: 'invalid-secret-key' }, { fetchImpl: noFetch }), (error) => {
    assert.doesNotMatch(inspect(error), /invalid-secret-key/);
    return true;
  });
  assert.doesNotMatch(warnings.join('\n'), /secret-server-message|secret-network-message|signed-jwt|BEGIN RSA PRIVATE KEY|invalid-secret-key/);
});

test('transient server errors and dropped connections share three retries with fresh signals', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const waits = [];
  const signals = [];
  const failures = [
    () => Response.json({ message: 'Unavailable' }, { status: 503 }),
    () => { throw new TypeError('fetch failed', { cause: new Error('ECONNRESET') }); },
    () => Response.json({ message: 'Bad gateway' }, { status: 502 }),
  ];
  const token = await getWritingToken(app, {
    fetchImpl: async (_, options) => {
      signals.push(options.signal);
      return failures.length ? failures.shift()() : tokenResponse();
    },
    sleepImpl: async (delay) => { waits.push(delay); },
  });
  assert.equal(token, 'installation-token');
  assert.deepEqual(waits, [1000, 2000, 4000]);
  assert.equal(new Set(signals).size, 4);
  assert.equal(signals.every((signal) => !signal.aborted), true);
});

test('persistent transient failures stop after four attempts and never include GitHub errors', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (message) => warnings.push(message));
  let requests = 0;
  const waits = [];
  await assert.rejects(getWritingToken(app, {
    fetchImpl: async () => {
      requests += 1;
      return Response.json({ message: `private-response ${privateKey}` }, { status: 500 });
    },
    sleepImpl: async (delay) => { waits.push(delay); },
  }), (error) => {
    assert.match(error.message, /HTTP 500.*after 4 attempt/);
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(inspect(error), /private-response|BEGIN RSA PRIVATE KEY/);
    return true;
  });
  assert.equal(requests, 4);
  assert.deepEqual(waits, [1000, 2000, 4000]);
  assert.equal(warnings.length, 3);
  assert.doesNotMatch(warnings.join('\n'), /private-response|BEGIN RSA PRIVATE KEY/);
});

test('401, ordinary 403, and 404 fail immediately without retrying', async () => {
  for (const status of [401, 403, 404]) {
    let requests = 0;
    await assert.rejects(getWritingToken(app, {
      fetchImpl: async () => {
        requests += 1;
        return Response.json({ message: 'Resource not accessible by integration' }, { status });
      },
      sleepImpl: () => { throw new Error('Permanent failures must not wait.'); },
    }), new RegExp(`HTTP ${status}.*after 1 attempt.*Check its installation`));
    assert.equal(requests, 1);
  }
});

test('rate limits honor Retry-After, then reset time, with a one-minute maximum wait', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  for (const [status, headers, message, expected] of [
    [429, { 'retry-after': '2' }, 'Too many requests', 2000],
    [403, { 'retry-after': '3', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 55) }, 'Rate limit', 3000],
    [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 4) }, 'API rate limit exceeded', 5000],
    [403, {}, 'You have exceeded a secondary rate limit.', 60_000],
    [429, {}, 'Too many requests', 60_000],
    [503, { 'retry-after': '60' }, 'Unavailable', 60_000],
    [503, { 'retry-after': new Date(now + 5000).toUTCString() }, 'Unavailable', 5000],
    [503, { 'retry-after': '-1' }, 'Unavailable', 1000],
    [429, { 'retry-after': '0' }, 'Too many requests', 0],
  ]) {
    let requests = 0;
    const waits = [];
    assert.equal(await getWritingToken(app, {
      fetchImpl: async () => ++requests === 1 ? Response.json({ message }, { status, headers }) : tokenResponse(),
      sleepImpl: async (delay) => { waits.push(delay); },
    }), 'installation-token');
    assert.deepEqual(waits, [expected]);
    assert.equal(requests, 2);
  }

  for (const [status, headers] of [
    [429, { 'retry-after': '61' }],
    [503, { 'retry-after': '61' }],
    [429, { 'retry-after': '9'.repeat(400) }],
    [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 60) }],
  ]) {
    let requests = 0;
    await assert.rejects(getWritingToken(app, {
      fetchImpl: async () => {
        requests += 1;
        return Response.json({ message: 'Limited' }, { status, headers });
      },
      sleepImpl: () => { throw new Error('An excessive wait must not be attempted.'); },
    }), /retry wait longer than 60 seconds/);
    assert.equal(requests, 1);
  }
});

test('a response body that breaks after the headers is retried', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let requests = 0;
  const waits = [];
  assert.equal(await getWritingToken(app, {
    fetchImpl: async () => {
      requests += 1;
      if (requests > 1) return tokenResponse();
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"token":"partial'));
          controller.error(new TypeError('terminated', { cause: new Error('ECONNRESET') }));
        },
      }), { headers: { 'content-type': 'application/json' } });
    },
    sleepImpl: async (delay) => { waits.push(delay); },
  }), 'installation-token');
  assert.equal(requests, 2);
  assert.deepEqual(waits, [1000]);
});

test('the timeout aborts both a missing response and a stalled body before retrying', async (t) => {
  t.mock.method(console, 'warn', () => {});
  for (const stalledBody of [false, true]) {
    let requests = 0;
    const server = createServer((_, response) => {
      requests += 1;
      if (requests === 1) {
        if (stalledBody) {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.write('{"token":"');
        }
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ token: 'installation-token', expires_at: new Date(Date.now() + 3600_000).toISOString(), permissions: { contents: 'read' } }));
    });
    t.after(() => { server.closeAllConnections(); server.close(); });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const signals = [];
    const waits = [];
    assert.equal(await getWritingToken(app, {
      fetchImpl: async (_, options) => {
        signals.push(options.signal);
        return fetch(`http://127.0.0.1:${server.address().port}`, options);
      },
      sleepImpl: async (delay) => { waits.push(delay); },
      timeoutMs: 200,
    }), 'installation-token');
    assert.equal(requests, 2);
    assert.deepEqual(waits, [1000]);
    assert.equal(signals[0].aborted, true);
    assert.equal(signals[0].reason.name, 'TimeoutError');
    assert.equal(signals[1].aborted, false);
    assert.notEqual(signals[0], signals[1]);
    server.closeAllConnections();
    server.close();
  }
});
