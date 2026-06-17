# CompareText

A free, privacy-first text comparison tool that runs entirely in your browser.

## Project structure

```
comparetext/
├── index.html              Compare tool (default page)
├── 404.html                GitHub Pages SPA fallback (same app shell)
├── .nojekyll               Disable Jekyll on GitHub Pages
├── assets/
│   ├── css/                Stylesheets
│   ├── js/                 JavaScript
│   ├── icons/              Favicons & app icons
│   └── images/             Image assets
├── robots.txt
├── manifest.json
└── sitemap.xml
```

SPA routes (`/about`, `/privacy`, `/terms`) are handled client-side via `404.html` on GitHub Pages — do not add physical folders for those paths.

## Routes

| Page    | Path (on GitHub Pages)              |
|---------|-------------------------------------|
| Compare | `/Text-Compare/`                    |
| About   | `/Text-Compare/about/`              |
| Privacy | `/Text-Compare/privacy/`            |
| Terms   | `/Text-Compare/terms/`              |

## Local development

Serve the `comparetext` folder with any static file server:

```bash
cd comparetext
python3 -m http.server 8080
```

Then open http://localhost:8080/ — the compare tool loads directly.

## Features

- Line, word, and character comparison
- Side-by-side, unified, and statistics views
- Ignore case, spaces, blank lines, and more
- File upload and drag & drop
- Dark mode
- 100% client-side — no data sent to any server

## Tech stack

- Vanilla HTML, CSS, and JavaScript
- No build step required
- LCS / Myers-style diff engine

## License

Open source — see Terms of Use in the app.
