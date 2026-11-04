<div align="center">

<img src="core/logo.svg" alt="Speys Local" width="96">

# Speys Local

### Your own tools, on your own computer.

Your day on one screen: tasks, Claude sessions, follow-ups and money.<br>
Hear when Claude is done, and have it write the tool you're missing.

<p>
  <img src="https://img.shields.io/badge/runs-100%25%20local-fb7a01?style=for-the-badge" alt="Runs 100% local">
  <img src="https://img.shields.io/badge/dependencies-0-22c55e?style=for-the-badge" alt="0 dependencies">
  <img src="https://img.shields.io/badge/build%20step-none-0ea5e9?style=for-the-badge" alt="No build step">
  <img src="https://img.shields.io/badge/node-24%2B-8b5cf6?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node 24+">
  <img src="https://img.shields.io/badge/PRs-welcome-ec4899?style=for-the-badge" alt="PRs welcome">
</p>

<a href="#-quick-start"><b>Quick start</b></a> ·
<a href="#-today"><b>Today</b></a> ·
<a href="#-claude-sessions"><b>Claude Sessions</b></a> ·
<a href="#-applets"><b>Applets</b></a> ·
<a href="#%EF%B8%8F-write-your-own"><b>Write your own</b></a> ·
<a href="CONTRIBUTING.md"><b>Contributing</b></a>

<br><br>

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/today-light.png">
  <img src="docs/images/today.png" alt="The Today dashboard in Speys Local: tasks, Claude sessions, follow-ups, this month's money and habits">
</picture>

</div>

## ☀️ Today

Open it and see what needs you: today's tasks, the Claude session waiting for approval, the follow-ups that are due, this month's profit, your habits. Every card comes from an applet, and a card you don't use simply isn't there. Dashboards get their own place at the top of the sidebar, so you can add more.

## 🔔 Claude Sessions

With a few Claude Code sessions open, it's easy to miss the one that finished. Speys Local tells you.

- **Pick your sound** for "session finished" and "needs your approval": your own audio file or a system sound, with a play button to try it.
- **Get a notification** when a job that took a while ends, so you can leave the tab.
- **See every session** at its desk in a little office: typing, raising a hand for approval, or done. Click a desk for the last request and reply, and pick the furniture yourself.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/office-light.png">
  <img src="docs/images/office.png" alt="Claude Sessions: sessions at their desks in a pixel office, one waiting for approval, one working, two done">
</picture>

## 🚀 Quick start

You need Node 24 or newer and git.

```bash
npx speys-local        # http://localhost:3400
```

The first run clones the repo to `~/speys-local`; run the same command to open it again. Or do it yourself:

```bash
git clone https://github.com/speys-app/speys-local.git
cd speys-local
node start.js
```

Start with the computer (macOS): `node start.js --install`, remove with `--uninstall`.
It checks GitHub once an hour and asks when there is an update; nothing installs without your click. Turn the check off in Settings. You can also update with `git pull`.

Settings and data live in `data/` next to the code. It stays out of git and updates don't touch it, but `git clean -x` would delete it, so don't run that here and keep your own backup. The interface comes in English and Turkish; pick the language in Settings.

**Just looking?** Pick **Demo** under the name in the sidebar: a workspace full of made-up data, rebuilt each time you open it.

### Claude hook

Session status, notifications and sound run on a Claude Code hook. Speys Local adds it to `~/.claude/settings.json` when you first open it: only its own entries, with a backup next to the file. Turn it off with the switch on the Claude Sessions page and it is removed. If you delete the folder first, the entry stays in the settings file but does nothing.

Speys Local is built and tested on macOS. It hasn't been tried on Windows or Linux yet, so expect rough edges there. Sound and notifications work on macOS for now. It comes with 13 sounds of its own. To add yours, put audio files in `data/apps/claude/sounds/`.

### Uninstall

Turn the hook off on the Claude Sessions page, run `node start.js --uninstall` if you set up autostart, then delete the folder. Your data is in `data/` inside it, so move that out first if you want to keep it.

## 🧩 Applets

Everything is an applet, and every applet is in the Store. Today, Tasks and Claude Sessions come installed; the rest is one click away, and removing one keeps its data.

| | Applet | What it does | Needs |
|---|---|---|---|
| 🔔 | **Claude Sessions** | Your sessions at their desks in a little office, with status, notifications and sound | Claude hook |
| ⌨️ | **Typo Check** | The typos you make writing to Claude, and practice built from them | Claude Code logs |
| ✅ | **Tasks** | The md task lists in your projects, which Claude sees too; keep an eye on any repo's GitHub issues and pull requests | Project folders or a repo |
| 💰 | **Finances** | Income, expenses, recurring payments | Nothing |
| 🤝 | **CRM** | Deals and meetings: pipelines, stages, next steps | Nothing |
| 🎬 | **Social Media Planner** | Content calendar: accounts, videos, posts, numbers | Nothing |
| 🔍 | **SEO** | Search Console, post checks, search previews | Your sites |
| 📚 | **OwnLearn** | Learn SQL from your own repo's code | A repo path |
| 🎁 | **Claude Wrapped** | Your month with Claude Code in numbers, and a card to share | Claude Code logs |
| 🗂️ | **Claude Files** | What has piled up in your Claude folders, read-only | Claude Code folders |
| ⏱️ | **Mac Time** | How long this Mac was in use today, and in which apps | macOS |
| 🗡️ | **Slay the Spire 2** | Your runs, read from the game's own save folder | The game |

<table>
  <tr>
    <td width="50%"><img src="docs/images/typo.png" alt="Typo Check: accuracy, speed and rhythm charts"><p align="center"><b>Typo Check</b></p></td>
    <td width="50%"><img src="docs/images/tasks.png" alt="Tasks: a task list read from a markdown file"><p align="center"><b>Tasks</b></p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/finances.png" alt="Finances: income and expenses by month"><p align="center"><b>Finances</b></p></td>
    <td width="50%"><img src="docs/images/crm.png" alt="CRM: a pipeline board"><p align="center"><b>CRM</b></p></td>
  </tr>
</table>

<sub>Screenshots use made-up data.</sub>

## 🛠️ Write your own

Tell Claude what you want: *"add an applet under `applets/custom/` that does this."* What you add there stays out of git, and updates don't touch it. Add `"dashboard": true` to `applet.json` to put it at the top of the sidebar. The smallest applet is two files:

```
applets/custom/my-notes/
  applet.json    { "name": "My notes", "icon": "icon.svg" }
  index.html     your page
```

| Folder | What goes there | In git |
|---|---|---|
| `applets/store/` | Every applet that ships to everyone, listed in the Store | Yes |
| `applets/custom/` | Applets on this computer only; a copy with the same id replaces the Store one | No |

## 🏪 Store

Every applet lives in this repo and shows up in the Store, with screenshots and what it reads. Installing one adds it to the sidebar; nothing is downloaded, and an applet you haven't installed runs no code. Every applet is reviewed before it's added and updates with Speys Local, only when you click. Wrote one? [Send it in](CONTRIBUTING.md#store).

## 🗂️ Workspaces

A workspace is its own settings and data: keep work and personal apart, or a client on its own. Switch or add one from the name in the sidebar. Each one is a folder in `data/`.

## 🔒 Your data stays here

The server binds to `127.0.0.1` and sends nothing out. It goes on the network for the hourly update check, a `git fetch` you can turn off in Settings, and when you ask: the update button, services you connect like Search Console or a GitHub repo, and the SEO applet's button that sends a page address to validator.schema.org.

## 🧰 In VS Code

[Speys Tools](https://github.com/speys-app/speys-vscode) is our VS Code extension for working across many repos: one key moves Source Control, the terminal and the Explorer to another project, and files go from the Explorer to Claude Code with a right click. It's a separate install, and Speys Local doesn't need it.

## 🤝 Contributing

Code and interface text are in English, and translations are optional, so you don't need another language to contribute. See [CONTRIBUTING.md](CONTRIBUTING.md).

Run the tests with `npm test`.

## 📄 License

[MIT](LICENSE). The Typo Check word lists are under CC BY-SA 4.0; see [their notice](applets/store/yazim/sozluk/README.md).
