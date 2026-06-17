# CompareText

A free, privacy-first text comparison tool that runs entirely in your browser.

## Project structure

```
comparetext/
├── index.html              Compare tool (default page)
├── 404.html                GitHub Pages SPA fallback (same app shell)
├── about/                  About page (SPA route)
├── privacy/                Privacy page (SPA route)
├── terms/                  Terms page (SPA route)
├── tools/
│   └── text-compare/       Redirects to /
├── assets/
│   ├── css/                Stylesheets
│   ├── js/                 JavaScript
│   ├── icons/              Favicons & app icons
│   └── images/             Image assets
├── robots.txt
├── manifest.json
├── sitemap.xml
└── 404.html
```

## Routes

| Page    | Path        |
|---------|-------------|
| Compare | `/`         |
| About   | `/about/`   |
| Privacy | `/privacy/` |
| Terms   | `/terms/`   |

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
