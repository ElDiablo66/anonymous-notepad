# Security

If you find a security problem, please don't open a public issue. Use "Report a vulnerability" under the Security tab of this repository, which reaches me privately.

The app's only network use is the update check against this repository's releases, and it installs an update only when the installer's signature matches the public key built into the app. Beyond that, the cases that matter most are a crafted file or folder name that makes the app read or write outside what you asked for, or content that runs as code inside the window.

## Supported versions

Only the [latest release](https://github.com/ElDiablo66/anonymous-notepad/releases/latest) gets fixes. A fix ships as a new release; older installers are not patched.

## What happens after you report

This is a one-person project, so I answer on a best-effort basis, usually within 7 days. I'll confirm the problem, tell you which release will carry the fix and credit you in the changelog unless you'd rather not be named.
