# Luna film header

The film at the top of the Luna Setup Portal: a small web page that Notion shows through an
embed block. It's set in the film's own design system: the #F2F1ED canvas, Schibsted
Grotesk and one purple accent.

- **The film plays in Vimeo's own player**, with Vimeo's play button and controls, full
  screen and quality menu. This page has no playback controls of its own.
- **The story beside it** starts as "Meet Luna." When the film plays, it shows the chapter
  that's playing, what happens in it, and who's talking. Luna's voice line flows in
  purple, everyone else's in ink.
- **Chapters**: click one and the film jumps there. The chapter that's playing fills as it
  plays. A chapter gets its check once most of it has actually played, and the checks are
  remembered on that browser.
- **It fits the embed**: three columns on a full-width Notion page, film plus story and
  chapters at Notion's normal width, and the film by itself on a phone.

## 1. Put the film on Vimeo

1. Upload the 4K master of the film (2160 × 3840, 1:48).
2. In the video's privacy settings, make it **Unlisted** (anyone with the link). If you only
   let it play on certain sites, add the address where this header will live (step 3).
3. Pick a thumbnail. It's the frame people see before they press play.
4. Copy the video's link and paste it into `vimeo` in `config.js`. An unlisted link has an
   extra code after the number, like `https://vimeo.com/123456789/abcdef1234`. Keep it.

About 4K: Vimeo picks the sharpest stream the screen and connection can take. In the small
frame that's an HD stream, which already looks as sharp as 4K at that size. In full screen
on a big display it steps up to 4K, if your Vimeo plan plays 4K (check your plan). Paid plans
can force a quality with `quality` in `config.js`. Viewers can still change it in Vimeo's menu.

Optional, in Vimeo:

- Add the same eight chapters there too. Then people watching full screen get them in Vimeo's own menu.
- Upload captions.
- Turn off the share and like buttons, if your plan lets you.

## 2. Preview it on this Mac

```bash
python3 tools/serve.py
```

Then open http://localhost:4173. Until `vimeo` is set, the header plays the local 4K file
(`preview` in `config.js`) with the browser's own controls, and says it's a preview. To try a
Vimeo link without editing `config.js`, add it to the address:
`http://localhost:4173/?vimeo=https://vimeo.com/123456789/abcdef1234`. If the video may only play
on certain sites, it won't play on localhost.

Use this server rather than `python3 -m http.server`: that one can't send part of a file, so
you can't jump around in the local film with it.

## 3. Put it online

It's published with GitHub Pages from the `mergedx/luna-film-header` repo, at
https://mergedx.github.io/luna-film-header/. Push a change to `main` and Pages republishes it,
usually within a minute or two. Until `vimeo` is set, the online page shows a setup note.

`.gitignore` keeps the local preview film (`media/film/*.mp4`) out of the repo: Vimeo plays the
film. Any other static host works too. It needs `index.html`, `config.js`, `css/`, `js/`
and `media/`, without the film.

## 4. Add it to the portal in Notion

1. Open the Luna Setup Portal home page. Click just under the moon banner, type `/embed`,
   and paste the header's address.
2. Drag the embed's bottom edge until it's about **640 px** tall. On a full-width page,
   about **720 px** gives the three-column layout.
3. On a phone, Notion shows the film by itself.

If Notion doesn't allow full screen inside embeds, Vimeo's full-screen button can't work
there either. In that case a **Full screen** button appears above the chapters. It opens the
header on its own page at the same moment, where full screen works.

## Change the chapters, or use a new cut

Each chapter in `config.js` has a start time in seconds (`at`), a `title`, a line of `text`
and a frame (`thumb`). For a new cut, make new frames and a new voice line. Give the film,
then one time per chapter, a second or two into each one:

```bash
tools/make-chapter-assets.sh path/to/film.mp4 1.5 13.2 20.5 49.4 57.6 71.5 92.2 106.5
```

This writes `media/chapters/01.jpg` onwards and `media/film/envelope.js` (the film's
loudness). `media/film/voices.js` says who speaks when. It was made from the film's edit
timeline, so update it for a new cut, or remove `voices` from `config.js`. The line then
shows the sound without names. The names shown for each speaker are under `speakers`.

## Address options

| Add to the address | What it does |
| --- | --- |
| `?vimeo=…` | Plays another Vimeo video |
| `?t=42` | Starts the film at 0:42 |

## Files

| File | What it is |
| --- | --- |
| `config.js` | Everything you edit: the Vimeo link, words, chapters, speaker names |
| `index.html`, `css/header.css` | The page and its look |
| `js/source.js` | Talks to the Vimeo player (or the local preview) |
| `js/chapters.js` | The chapter list and the "now playing" panel |
| `js/listen.js` | The voice line |
| `js/main.js` | Layout and wiring |
| `media/` | Chapter frames, the voice line's data, the tab icon, the local preview film |
| `tools/serve.py` | The preview server |
| `tools/make-chapter-assets.sh` | Frames and voice line for a new cut |
