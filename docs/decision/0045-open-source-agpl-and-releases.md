# ADR-0045: Open source under AGPL-3.0, with releases under stable names

- Status: Accepted
- Date: 2026-11-21
- Builds on: ADR-0036, ADR-0044

## Context

The landing page needs download buttons that strangers can use. Desktop builds are GitHub Actions artifacts in a private repository, which only the owner can reach. The owner chose to publish the source, like Tinycast.

## Decision

1. **License: AGPL-3.0-only** (`LICENSE` at the root, and `"license"` in every `package.json`). Anyone may use and change Thoth. Someone who offers a modified version to others over a network must publish their changes. That keeps hosted forks open.
2. **Releases.** On a `v*` tag, the desktop workflow creates a GitHub Release and attaches the installers under names that never change between versions:

   | Platform             | Installer                                              |
   | -------------------- | ------------------------------------------------------ |
   | macOS, Apple Silicon | `Thoth-macOS-arm64.dmg`                                |
   | macOS, Intel         | `Thoth-macOS-x64.dmg`                                  |
   | Windows              | `Thoth-Windows-x64.msi`                                |
   | Linux                | `Thoth-Linux-x86_64.AppImage`, `Thoth-Linux-amd64.deb` |

   The landing page links to `releases/latest/download/<name>`, so its links never need editing.
3. **Going public is the owner's action.** Before it, the whole git history is scanned for:
   - secrets;
   - personal data;
   - large private files.

   Findings are reported to the owner, and any history rewrite needs their explicit yes. The owner switches the repository to public in GitHub settings.

## Consequences

- Anyone can build Thoth from source. The docs and ADRs become public too, which is intended.
- Installers stay unsigned (ADR-0036), and the page explains the first-launch warnings.
- `docs/research/` stays git-ignored, so the private YouLearn research notes are never published.
