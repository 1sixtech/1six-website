# Security Best Practices Report

Date: 2026-04-13
Scope: full review of tracked application code and config in this repo (`51` files under `src/` plus `package.json` and `next.config.ts`), plus runtime header checks against the deployed site and a dependency audit.

## Remediation Update

The two material findings in this report have been remediated in the current working tree on 2026-04-13:

1. `next` and `eslint-config-next` were upgraded to `16.2.3`.
2. Global browser hardening headers were added in `next.config.ts`, and the theme bootstrap logic was moved from an inline script in `layout.tsx` to [`public/theme-init.js`](/Users/Giwook/1sixtech/project/1six-website/public/theme-init.js:1).

Post-fix verification results:

- `pnpm audit --json`: `0` vulnerabilities
- `pnpm build`: success
- Local production response headers now include `Content-Security-Policy`, `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, and `Permissions-Policy`

Note: Next.js App Router still emits inline runtime scripts in static output, so the shipped CSP uses the official baseline `script-src 'self' 'unsafe-inline'` form instead of a nonce-only policy. Moving to nonce-based CSP would require dynamic rendering, which is a significant tradeoff for this static site.

## Executive Summary

This codebase is structurally low-risk because it is a static marketing site: there are no API routes, no database access, no authentication/session layer, no user-generated HTML rendering, and no committed secrets visible in the repository. I did not find any direct XSS, SSRF, open redirect, authz, or secret-exposure bugs in the application code.

I did find two material security issues:

1. `next@16.2.2` is in the vulnerable range for a newly published App Router denial-of-service advisory.
2. The deployed site is missing baseline browser security headers, and the current inline bootstrap script means a future CSP rollout needs deliberate work rather than a one-line header change.

## High Severity

### SBP-001

- Rule ID: `NEXT-SUPPLY-001`
- Severity: High
- Location: [package.json](/Users/Giwook/1sixtech/project/1six-website/package.json:13), `dependencies.next`
- Evidence:

```json
"next": "^16.2.2"
```

`pnpm audit --json` on 2026-04-13 reported advisory `GHSA-q4gf-8mx6-v5v3`, with:

- vulnerable versions: `>=16.0.0-beta.0 <16.2.3`
- recommendation: `Upgrade to version 16.2.3 or later`

Vendor advisory evidence:

- Vercel changelog for CVE-2026-23869 says a crafted request to an App Router Server Function endpoint can trigger excessive CPU usage and cause denial of service.
- Vercel also states that WAF mitigations are not a substitute for upgrading.

- Impact: A remotely reachable request path in the affected runtime can be abused for CPU exhaustion and service degradation or outage.
- Fix: Upgrade `next` and `eslint-config-next` to `16.2.3` or later, then rerun `pnpm build` and `pnpm lint`.
- Mitigation: If the site is hosted on Vercel, their changelog says platform WAF rules help reduce exposure, but they explicitly recommend upgrading anyway.
- False positive notes: I found no app-defined Server Actions or route handlers in source, and the generated `.next/server/server-reference-manifest.json` had empty `node`/`edge` maps after build. That likely reduces exploit surface, but it does not override the vendor guidance to patch.

## Medium Severity

### SBP-002

- Rule ID: `NEXT-HEADERS-BASELINE`
- Severity: Medium
- Location: [next.config.ts](/Users/Giwook/1sixtech/project/1six-website/next.config.ts:35), [src/app/layout.tsx](/Users/Giwook/1sixtech/project/1six-website/src/app/layout.tsx:128)
- Evidence:

`next.config.ts` only sets `Cache-Control` on `/resource/:path*` and does not define global security headers:

```ts
headers: async () => [
  {
    source: '/resource/:path*',
    headers: [
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ],
  },
],
```

The root layout also injects inline scripts:

- [src/app/layout.tsx:128](/Users/Giwook/1sixtech/project/1six-website/src/app/layout.tsx:128) theme/intro bootstrap via `dangerouslySetInnerHTML`
- [src/app/layout.tsx:186](/Users/Giwook/1sixtech/project/1six-website/src/app/layout.tsx:186) JSON-LD script via `dangerouslySetInnerHTML`

Runtime verification on 2026-04-13 with `curl -I https://1six.tech` showed:

- present: `Strict-Transport-Security`
- absent: `Content-Security-Policy`
- absent: `X-Frame-Options`
- absent: `X-Content-Type-Options`
- absent: `Referrer-Policy`
- absent: `Permissions-Policy`

- Impact: There is no browser-enforced backstop if a future DOM/script injection bug is introduced, and the site can currently be embedded by hostile origins for clickjacking-style UI redress. Missing `nosniff`, referrer, and permissions policies also leave standard hardening gaps open.
- Fix:

1. Add global security headers through `next.config.ts` or edge config for:
   - `Content-Security-Policy`
   - `X-Frame-Options` or preferably CSP `frame-ancestors`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy`
   - `Permissions-Policy`
2. Refactor the inline bootstrap script in `layout.tsx` to a nonce-based script or an external boot script so CSP can be deployed without falling back to weak `unsafe-inline`.

- Mitigation: If a full CSP rollout is too disruptive immediately, ship `frame-ancestors`/`X-Frame-Options`, `nosniff`, `referrer-policy`, and `permissions-policy` first, then stage CSP separately.
- False positive notes: Some teams inject headers at CDN/edge rather than in repo code. I checked the live homepage directly, and those headers were not present at runtime.

## Good Findings / Low Risk Areas

- No committed `.env*` files were tracked in git, and `.gitignore` ignores `.env` and `.env.*`.
- No `process.env` or `NEXT_PUBLIC_*` usage was found in application source.
- No API routes, Route Handlers, Server Actions, or cookie/session handling were found in source.
- `dangerouslySetInnerHTML` is used only for constant inline bootstrap code and static JSON-LD, not for user-controlled content.
- I found no usage of `eval`, `new Function`, `document.write`, `postMessage`, `window.open`, `innerHTML`, or user-controlled redirect/navigation sinks.
- The error boundary intentionally avoids exposing raw internal error details to users ([src/app/error.tsx](/Users/Giwook/1sixtech/project/1six-website/src/app/error.tsx:3)).

## Verification Performed

- `pnpm audit --json`
  Result: 1 high-severity advisory affecting `next@16.2.2`
- `pnpm build`
  Result: success
- `pnpm lint`
  Result: failed, but the reported issues are lint/type-quality issues already present in the codebase and not the basis for the security findings above

## Recommended Next Steps

1. Upgrade `next` and `eslint-config-next` to `16.2.3+`.
2. Add baseline security headers globally.
3. Refactor the inline bootstrap script so CSP can be deployed cleanly.
4. Re-run `pnpm audit`, `pnpm build`, and `pnpm lint` after the upgrade/header work.
