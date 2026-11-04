# Speys Local

Read [CONTRIBUTING.md](CONTRIBUTING.md) first: folders, `applet.json`, backends, pages, translations, Store.

- Node 24+, no dependencies, no build step. Paths through `node:path`; dynamic imports through `pathToFileURL`.
- Speed is a requirement: backends load on first request, nothing heavy at startup.
- A new applet for this computer goes in `applets/custom/<id>/`. Don't edit `applets/store/` for a personal need: copy the applet to `applets/custom/` under the same id.
- Pages use relative addresses (`./api/...`) and `t("English text")`; the Turkish goes in `locales/tr.json`.
- An applet doesn't import another applet or `core/`; shared code goes in `lib/`.
- No personal data, customer names or personal paths in the repo: those belong in settings.
- Run `npm test`.
