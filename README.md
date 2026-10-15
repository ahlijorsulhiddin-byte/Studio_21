# My Studio

Web app for photo, video and avatar editing. Pure frontend.

## Run locally

```bash
python -m http.server 8080
```

Open http://localhost:8080

## GitHub Pages (important)

1. Put these files in the **root** of the repository (not inside a subfolder):

```
index.html
css/styles.css
js/...
README.md
.gitignore
```

2. Settings → Pages → Deploy from branch **main** → folder **/ (root)** → Save.

3. Open: `https://YOUR_USERNAME.github.io/REPO_NAME/`

If the page is white and the logo is huge, CSS did not load — check that `css/styles.css` exists at the repo root path `css/styles.css`.

## Structure

```
index.html
css/styles.css
js/app.js
js/core/
js/editors/
```
