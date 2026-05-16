# Security Policy

Thanks for helping keep Sunflower Land Overview and its users safe.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use one of the following private channels:

1. **Preferred — GitHub Private Vulnerability Reporting:** open an advisory at
   https://github.com/eliasSFL/sunflower-land-overview/security/advisories/new
2. **Email:** elias@sunflower-land.com

When reporting, please include:

- A description of the issue and the impact you believe it has.
- Steps to reproduce (a minimal proof-of-concept is ideal).
- The commit SHA or deployed URL where you observed the behaviour.
- Any suggested mitigation, if you have one.

You should receive an acknowledgement within **7 days**. We aim to triage and
confirm reports within **14 days**, and to release a fix or mitigation for
confirmed high-severity issues within **90 days**. This project is maintained
by a single person in their spare time, so please bear with us if a response
arrives near the end of these windows.

We will credit reporters in the published advisory unless you ask to remain
anonymous.

## Scope

**In scope:**

- The Cloudflare Worker (`src/api/`, `vite.worker.config.ts`) — auth,
  secret handling, request routing, push subscription storage.
- The SPA (`src/`) — XSS, leakage of farm IDs or push credentials,
  client-side handling of API responses.
- The GitHub Actions workflows in `.github/workflows/`.

**Out of scope:**

- Vulnerabilities in the upstream
  [Sunflower Land game](https://github.com/sunflower-land/sunflower-land) —
  please report those to the game's maintainers.
- Vulnerabilities in the Sunflower Land Community API — please report those
  to the Sunflower Land team directly.
- Self-XSS that requires the victim to paste attacker-supplied code into
  their own DevTools.
- Denial-of-service attacks against the Cloudflare Worker that rely solely
  on volume rather than a logic flaw.
- Findings from automated scanners without a demonstrated impact.

## Supported versions

Only the currently deployed version (HEAD of `master`) is supported. There
are no LTS branches; fixes land on `master` and are deployed from there.

## Safe harbour

We will not pursue or support legal action against researchers who:

- Make a good-faith effort to follow this policy.
- Avoid privacy violations, data destruction, and service degradation.
- Do not exfiltrate more data than necessary to demonstrate the issue, and
  delete any retrieved data once the report is filed.
