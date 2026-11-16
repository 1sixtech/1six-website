import { setTimeout as sleep } from 'node:timers/promises';
import { createAppAuth } from '@octokit/auth-app';
import { request } from '@octokit/request';

// An installation token is restricted again when issued, even if someone later
// installs the app on another repository or grants the app more permissions.
const REPOSITORY_ID = 1439376590;
const TOKEN_CHARACTERS = /^[\x21-\x7E]+$/;
const APP_SETTINGS = ['WRITING_GITHUB_APP_ID', 'WRITING_GITHUB_INSTALLATION_ID', 'WRITING_GITHUB_PRIVATE_KEY'];
const MAX_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 60_000;

function checkedToken(token) {
  if (!token || !TOKEN_CHARACTERS.test(token)) {
    throw new Error('WRITING_GITHUB_TOKEN is empty or has a space, line break, or non-ASCII character in it.');
  }
  return token;
}

function retryDelay(response, error, retriesUsed) {
  // No response means the connection failed. A successful status without a usable
  // token includes bodies Octokit could not finish reading or parse as JSON.
  if (!response) return 1000 * 2 ** retriesUsed;
  const { status, headers } = response;
  const retryAfter = headers.get('retry-after');
  const limited = status === 429 || (status === 403 && (
    retryAfter !== null || headers.get('x-ratelimit-remaining') === '0'
    || /\brate limit\b/i.test(error?.response?.data?.message ?? '')
  ));
  if (!limited && status < 500 && !(status >= 200 && status < 300)) return undefined;

  if (retryAfter?.trim()) {
    // Keep even an overflowing seconds value as an excessive wait; replacing
    // it with the backoff would retry before GitHub allows another request.
    if (/^\d+(?:\.\d+)?$/.test(retryAfter.trim())) return Number(retryAfter) * 1000;
    if (Number.isNaN(Number(retryAfter))) {
      const delay = Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(delay)) return Math.max(0, delay);
    }
  }
  const resetAt = Number(headers.get('x-ratelimit-reset'));
  if (limited && headers.get('x-ratelimit-remaining') === '0' && resetAt > 0) {
    return Math.max(resetAt * 1000 - Date.now(), 0) + 1000;
  }
  return limited ? MAX_RETRY_WAIT_MS : 1000 * 2 ** retriesUsed;
}

/** Build-only authentication. Actions can supply their own short-lived repository token. */
export async function getWritingToken(env = process.env, { fetchImpl = fetch, sleepImpl = sleep, timeoutMs = 30_000 } = {}) {
  const token = env.WRITING_GITHUB_TOKEN?.trim();
  if (token) return checkedToken(token);

  const missing = APP_SETTINGS.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`The private writing repository needs WRITING_GITHUB_TOKEN or GitHub App credentials. Missing: ${missing.join(', ')}.`);
  }
  const appId = env.WRITING_GITHUB_APP_ID.trim();
  const installationId = env.WRITING_GITHUB_INSTALLATION_ID.trim();
  if (!/^[1-9]\d*$/.test(appId) || !/^[1-9]\d*$/.test(installationId) || !Number.isSafeInteger(Number(installationId))) {
    throw new Error('WRITING_GITHUB_APP_ID and WRITING_GITHUB_INSTALLATION_ID must be positive integer IDs.');
  }

  for (let retriesUsed = 0; ; retriesUsed += 1) {
    let attempted = false;
    let response;
    let delay;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('GitHub App authentication timed out', 'TimeoutError')), timeoutMs);
    timer.unref();
    try {
      const auth = createAppAuth({
        appId,
        installationId: Number(installationId),
        privateKey: env.WRITING_GITHUB_PRIVATE_KEY.trim(),
        request: request.defaults({
          headers: { 'X-GitHub-Api-Version': '2022-11-28' },
          request: {
            signal: controller.signal,
            fetch: async (...args) => {
              attempted = true;
              response = await fetchImpl(...args);
              return response;
            },
          },
        }),
      });
      const authentication = await auth({
        type: 'installation',
        repositoryIds: [REPOSITORY_ID],
        permissions: { contents: 'read' },
      });
      controller.signal.throwIfAborted();
      return checkedToken(authentication.token);
    } catch (error) {
      // Octokit errors may carry the signed JWT, request headers or private key.
      // Only numeric status and retry counts may leave this boundary.
      delay = attempted ? retryDelay(response, error, retriesUsed) : undefined;
      const status = response ? ` (HTTP ${response.status})` : '';
      if (retriesUsed === MAX_RETRIES || delay === undefined || delay > MAX_RETRY_WAIT_MS) {
        const advice = delay === undefined
          ? 'Check its installation, Contents: read permission, and WRITING_GITHUB_* credentials.'
          : delay > MAX_RETRY_WAIT_MS ? 'GitHub requires a retry wait longer than 60 seconds. Try again later.' : 'GitHub did not complete the token exchange. Try again later.';
        throw new Error(`Could not authenticate the writing GitHub App${status} after ${retriesUsed + 1} attempt(s). ${advice}`);
      }
      console.warn(`Retry ${retriesUsed + 1} of ${MAX_RETRIES} for writing GitHub App authentication${status} in ${delay / 1000} s.`);
    } finally {
      clearTimeout(timer);
    }
    await sleepImpl(delay);
  }
}
