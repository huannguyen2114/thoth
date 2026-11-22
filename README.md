# Thoth

**Learn anything from your own sources.**

[Website](https://thoth-5j7.pages.dev) · [Download](https://github.com/huannguyen2114/thoth/releases/latest) · [Docs](docs/README.md)

Thoth turns your PDFs, lectures, YouTube videos and web pages into chats, notes, quizzes, flashcards and exams. It runs on your computer, with the AI model you choose: your Claude subscription, an Anthropic API key, or any OpenAI-compatible provider, including a local model through Ollama or LM Studio.

<picture>
  <source srcset="apps/site/public/shots/workspace-dark.png" media="(prefers-color-scheme: dark)">
  <img src="apps/site/public/shots/workspace-light.png" alt="Thoth's content workspace: a PDF, its chapters, chat with citations and notes" width="1440">
</picture>

## What it does

- **Chat with citations.** Answers point to the page, timestamp or paragraph they came from, and a click jumps there.
- **Notes that link back.** Send a passage from a PDF, transcript or summary to your notes as a quote that opens the source at that spot.
- **PDF annotation.** Highlight, comment, draw, and export an annotated copy.
- **Practice.** Quizzes with five question types, free answers graded with feedback, flashcards scheduled with FSRS, and timed exams.
- **Spaces.** Chat across a whole course, a dashboard of what is due, and space notes and boards.
- **Planner and whiteboard.** A study plan that adapts to your progress, and mind maps linked to the source.
- **Private by design.** No account, no telemetry. Your data stays in one folder on your computer; API keys go in the system keychain.

## Install

Download the installer for your system from the [latest release](https://github.com/huannguyen2114/thoth/releases/latest):

| System                | File                                                     |
| --------------------- | -------------------------------------------------------- |
| macOS (Apple Silicon) | `Thoth-macOS-arm64.dmg`                                  |
| macOS (Intel)         | `Thoth-macOS-x64.dmg`                                    |
| Windows               | `Thoth-Windows-x64.msi`                                  |
| Linux                 | `Thoth-Linux-x86_64.AppImage` or `Thoth-Linux-amd64.deb` |

On a Mac you can also use Homebrew:

```bash
brew tap huannguyen2114/thoth https://github.com/huannguyen2114/thoth
brew install --cask thoth
```

The app updates itself: it checks for a new version when it starts, and from **Check for Updates…** in the menu.

The installers are not code-signed yet. On macOS, right-click the app and choose **Open** the first time. On Windows, choose **More info**, then **Run anyway**.

To use your Claude subscription, install [Claude Code](https://claude.com/claude-code) and sign in once.

## Build from source

Requirements: Node 22 or newer and pnpm 12. The desktop app also needs the Rust toolchain.

```bash
pnpm install
pnpm dev             # the web app at http://127.0.0.1:3000
pnpm check           # lint, typecheck and unit tests
pnpm test:e2e        # browser tests against a scripted model
pnpm desktop:build   # the desktop app for this machine
pnpm site:dev        # the landing page
```

## Docs

- [Where everything is](docs/README.md)
- [Architecture](docs/technical_design/01-architecture.md)
- [Decisions (ADRs)](docs/decision/README.md)
- [Roadmap](docs/plan/roadmap.md)
- [Hearth design system](design/hearth/README.md)
- [Guide for coding agents](CLAUDE.md)

## License

Thoth is free software under the [GNU Affero General Public License v3.0](LICENSE). You may use, study, change and share it. If you offer a modified version to others over a network, you must share your changes under the same license.
