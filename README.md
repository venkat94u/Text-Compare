# CompareText

A free, privacy-first text comparison tool that runs entirely in your browser.

## Project structure

```
comparetext/
├── index.html              Landing page
├── about/                  About page (SPA route)
├── privacy/                Privacy page (SPA route)
├── terms/                  Terms page (SPA route)
├── tools/
│   └── text-compare/       Main compare tool
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

| Page    | Path                    |
|---------|-------------------------|
| Home    | `/`                     |
| Compare | `/tools/text-compare/`  |
| About   | `/about/`               |
| Privacy | `/privacy/`             |
| Terms   | `/terms/`               |

## Local development

Serve the `comparetext` folder with any static file server:

```bash
cd comparetext
python3 -m http.server 8080
```

Then open:

- Landing: http://localhost:8080/
- Tool: http://localhost:8080/tools/text-compare/

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
