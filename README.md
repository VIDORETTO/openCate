<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/opencate-logo.svg" />
    <img src="assets/opencate-logo-light.svg" alt="openCate" width="140" />
  </picture>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  An infinite canvas IDE for parallel coding agents.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/VIDORETTO/openCate?style=flat-square" alt="MIT License" /></a>
  <a href="https://github.com/VIDORETTO/openCate/actions"><img src="https://img.shields.io/github/actions/workflow/status/VIDORETTO/openCate/ci.yml?style=flat-square" alt="CI" /></a>
  <a href="https://github.com/VIDORETTO/openCate/releases"><img src="https://img.shields.io/github/downloads/VIDORETTO/openCate/total?style=flat-square" alt="Downloads" /></a>
</p>

---

<p align="center">
  <img src="assets/demo-canvas.gif" alt="openCate demo" width="900" />
</p>

Run Claude Code, Codex, or any agent CLI in a openCate terminal and the canvas becomes mission control: every terminal shows whether its agent is working, finished, or waiting on you, and openCate notifies you the moment one needs input. One click spins up a git worktree with its own colored territory on the canvas, so five agents on five branches stay five visibly separate workstreams instead of a pile of tabs.

Open a folder and it becomes a workspace. No config files.

<p align="center">
  <em>Pst. Hey, you, join our stargazers :)</em>
</p>

<p align="center">
  <a href="https://github.com/VIDORETTO/openCate"><img src="https://img.shields.io/github/stars/VIDORETTO/openCate?style=social" alt="Star openCate on GitHub" /></a>
</p>

## Install

Download a prebuilt release. Don't build from source for daily use.

| Platform | Formats | Link |
|----------|---------|------|
| macOS | DMG, ZIP (`arm64`, `x64`) | [Latest release](https://github.com/VIDORETTO/openCate/releases/latest) |
| Windows | NSIS installer, ZIP (`x64`) | [Latest release](https://github.com/VIDORETTO/openCate/releases/latest) |
| Linux | AppImage, DEB, `tar.gz` (`x64`) | [Latest release](https://github.com/VIDORETTO/openCate/releases/latest) |

On macOS you can also install with Homebrew:

```sh
brew install --cask opencate
```

## What's inside

- **Agent-aware terminals.** Claude Code, Codex, Cursor, Grok, OpenCode and Pi report turn start, turn end, and permission prompts, so each panel shows running / waiting / finished and pings you when it needs an answer.
- **Agent sessions survive restarts.** Reopen the project and terminals come back with their scrollback, each agent reattached with its own resume command.
- **Worktrees for parallel branches.** Type what you're working on and openCate creates the worktree and branch, off a local branch, a remote branch, or an open PR.
- **Panels on a canvas or in a dock.** Terminals, Monaco editors, browsers, PDF/image/DOCX viewers, and extension webviews can float, dock into tabs and splits, or detach into their own window. Independent canvas panels and their layouts persist per project; nesting a canvas inside another is not supported yet.
- **Git and search.** Multi-repo source control, git badges in the file tree, side-by-side diffs, ripgrep search, and `Cmd+K` for commands, panels, and files.
- **A CLI agents can call.** In a openCate terminal, `cate` drives a browser panel, reads another terminal, opens files, manages panels.
- **Local and remote are the same path.** Point openCate at a host over SSH or WSL and terminals, git, search, and agents run there; editors, browser, and canvas stay local.

Press `Cmd+K` for everything else. Shortcuts are rebindable in Settings.

## Extensions

openCate has an extension system for third-party panels (MCP servers, diagrams, and more), each served in its own isolated webview. Browse and build them in the companion repo: [0-AI-UG/cate-extensions](https://github.com/0-AI-UG/cate-extensions).

## Contributing

Build-from-source instructions and the contribution workflow are in [CONTRIBUTING.md](CONTRIBUTING.md). Release history is in the [CHANGELOG](CHANGELOG.md).

## Star history

<a href="https://www.star-history.com/?repos=VIDORETTO%2FopenCate&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=VIDORETTO/openCate&type=date&theme=dark&legend=top-left&sealed_token=LE-sv5TdJtUmugufglkRue9ZJ6mVXcScJNurvXl9qwGAOHy-taiZA7-UfpBCAHbsxUZESm-1aSxX55u3DTth--kCTUty5gqe7XMhmI-dHz2IOkizZgAk26fW8iovuRbeMSyla3c2T9w9fAj6x2_SZZEGbmvonWJvvLcI-X35nHZFkQQIn_ueBO07uQZM" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=VIDORETTO/openCate&type=date&legend=top-left&sealed_token=LE-sv5TdJtUmugufglkRue9ZJ6mVXcScJNurvXl9qwGAOHy-taiZA7-UfpBCAHbsxUZESm-1aSxX55u3DTth--kCTUty5gqe7XMhmI-dHz2IOkizZgAk26fW8iovuRbeMSyla3c2T9w9fAj6x2_SZZEGbmvonWJvvLcI-X35nHZFkQQIn_ueBO07uQZM" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=VIDORETTO/openCate&type=date&legend=top-left&sealed_token=LE-sv5TdJtUmugufglkRue9ZJ6mVXcScJNurvXl9qwGAOHy-taiZA7-UfpBCAHbsxUZESm-1aSxX55u3DTth--kCTUty5gqe7XMhmI-dHz2IOkizZgAk26fW8iovuRbeMSyla3c2T9w9fAj6x2_SZZEGbmvonWJvvLcI-X35nHZFkQQIn_ueBO07uQZM" />
 </picture>
</a>

## License

[MIT](LICENSE)
