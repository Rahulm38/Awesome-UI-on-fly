# Contributing

Thanks for helping improve Awesome UI on Fly. Bug reports, focused fixes, and ideas are welcome.

## Run the demo

There is no build step, package manager, or install. Open `index.html` in a modern browser, or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Keep the project safe and simple

- Keep the demo browser-only and dependency-free unless a change clearly needs more.
- Use fictional cards, transactions, and identities. Never add real financial data, credentials, API keys, or private screenshots.
- The models and banking flow are simulations. Do not add real model or banking service calls without first discussing the scope in an issue.
- Keep changes focused and describe the user-visible effect.

## Before opening a pull request

- Open the demo and try the affected scenario, including the relevant responsive layout when the UI changes.
- Check the browser console for errors.
- Review the diff for credentials and private data. `./check-clean.sh` can also scan against a private word list when one is configured; it skips the scan if no list is available.
- In the pull request, summarize the change and how you checked it. Include screenshots for visual changes, using fictional data only.

For bugs and ideas, use the repository's issue forms.
