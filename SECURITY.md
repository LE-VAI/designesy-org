# Security policy

## Reporting a vulnerability

Please report security issues privately. Do not open a public issue, pull request or discussion for them.

Two ways to report:

- **GitHub private vulnerability reporting.** Open the [Security tab](https://github.com/LE-VAI/designesy-org/security) of this repository and choose **Report a vulnerability**.
- **Email** [hello@designesy.org](mailto:hello@designesy.org). The same contact is published in [security.txt](https://www.designesy.org/.well-known/security.txt).

We aim to acknowledge a report within 5 business days. We will keep you updated while we work on a fix, and we will tell you when it ships. Please give us a reasonable time to fix the issue before you disclose it. Fixed issues are published as GitHub security advisories on this repository, and we credit reporters who want credit.

## What to include

- The component and version affected (see the table below).
- What an attacker can do, and what they need to do it.
- Steps to reproduce: the request, URL, command or MCP tool call, and what came back.
- A proof of concept if you have one. Keep it minimal.
- Whether the issue is already public anywhere.

## Scope

In scope:

- **www.designesy.org**, including its API routes under `/api/` (for example `/api/score`) and the remote MCP endpoint at `/api/mcp`. The scoring routes fetch URLs that callers send, so server-side request forgery through them is in scope.
- **The npm packages** published from this repository: `@designesy/score`, `@designesy/cli`, `@designesy/tokens`, `@designesy/stylelint-plugin-dtcg-tokens` and `@designesy/lab-builder`.
- **The PyPI package** `designesy-mcp`, the local MCP server.
- **The GitHub Action** Designesy Contract Check (`LE-VAI/designesy-org@v1`), and the composite action in `.github/actions/tokens-validate`.

Out of scope:

- Sites that Designesy scores. Report those to their owners.
- Denial of service, load testing or automated scanning against www.designesy.org. Run a local build instead (see [CONTRIBUTING.md](CONTRIBUTING.md)).
- Social engineering, and anything that needs access to another person's account or device.
- Missing security headers or best-practice findings with no demonstrated impact.

## Supported versions

Fixes go into the latest release of each component.

| Component | Supported |
|---|---|
| www.designesy.org, its API and the MCP endpoint | The live deployment |
| npm packages (`@designesy/*`) | The latest release of each package |
| `designesy-mcp` (PyPI) | The latest release |
| Designesy Contract Check action | The latest release, through the `v1` tag |
| `designesy-score` (npm, deprecated) | Not supported. Use `@designesy/score` |
