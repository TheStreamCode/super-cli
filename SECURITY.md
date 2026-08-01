# Security Policy

## Supported versions

Security fixes target the latest published version of Super CLI. Please verify a report against that
version when possible; older releases may be asked to upgrade before a fix is evaluated.

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues. Use GitHub's
[private vulnerability reporting](https://github.com/TheStreamCode/super-cli/security/advisories/new)
or email `info@mikesoft.it` with a clear description, the affected version, reproduction steps, and
the impact you observed. Remove credentials, tokens, and unrelated personal data from the report.

The maintainer will acknowledge the report, validate it privately, and coordinate disclosure after a
fix is available. Please avoid publishing details before that coordination is complete.

## Security model

This extension launches user-configured terminal commands and user-requested agent update commands. It
does not install agent CLIs, execute installer scripts, alter `PATH` or shell profiles, or modify agent
configuration files. When a supported CLI is missing, it can open only that preset's verified official
installation documentation in the external browser.

Only the user (global) value of `superCli.agents` is read; workspace overrides are ignored. Review
Workspace Trust prompts and user-level configuration changes before running commands in untrusted
repositories.
