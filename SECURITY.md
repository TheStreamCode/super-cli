# Security Policy

Please do not report security vulnerabilities through public GitHub issues.

Email security concerns to info@mikesoft.it with a clear description, affected version, and reproduction details.

This extension launches user-configured terminal commands and user-requested agent update commands. It
does not install agent CLIs, execute installer scripts, alter `PATH` or shell profiles, or modify agent
configuration files. When a supported CLI is missing, it can open only that preset's verified official
installation documentation in the external browser.

Only the user (global) value of `superCli.agents` is read; workspace overrides are ignored. Review
Workspace Trust prompts and user-level configuration changes before running commands in untrusted
repositories.
