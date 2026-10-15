# THE PATH

A first-person story game in development.

The first chapter is free to play in your browser: 1982, the ride downtown, THE JUNCTION arcade, and the cabinet
with no name.

- `index.html`: the landing page
- `play/`: the web game (the first chapter, in development)
- `devlog.json`: What's new, Now building and Help us test, rendered by the game hub into the page's `#news` section.
  Public text only: before every publish run the studio's privacy gate on it,
  `node ~/Projects/sites/bigpic-studio/tools/hub/check-devlog.mjs devlog.json`. Add a release at the top (newest first);
  `{ "group": "..." }` items make sub-headings inside a big release.
- `assets/hub/`: a copy of the shared BigPic Studios game hub (`hub.js` + `hub.css`, from the studio repo's
  `assets/hub/`), so this site works on its own. When the studio's copy changes, copy both files here again.
  The page dresses it in THE PATH's look with the `.news .hub-*` rules in `index.html`. The feedback form posts to
  BigPic Pulse as project `the-path`.
