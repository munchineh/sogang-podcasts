# Sogang Podcasts: technical notes

Reference for whoever works on this next (usually Claude). Keep it current when something changes.

## What it is

A Korean-learning podcast built from Mancini's Sogang Anki cards. Two hosts, 준 (Jun) and 수아 (Sua), act out a scene
(장면) using the cards' vocab and grammar, then explain it (해설) and drill it (마무리 복습). The site plays the audio with
line-by-line and syllable-by-syllable highlighting, purple grammar marks and dotted vocab marks, translations, and a
sheet for every expression.

Site: https://munchineh.github.io/sogang-podcasts/ (GitHub Pages, branch `main`, root). Installed on the phone as a
home-screen web app.

## Where things live

| Place | What |
|---|---|
| Mac `~/Projects/anki-audio/podcast/` | **Source of truth.** Scripts, audio generation, timing, site build and publish. |
| Mac `~/Projects/anki-audio/github_token.txt` | Fine-grained token (Contents read/write on this repo only). Never commit or print it. |
| Mac `~/Projects/anki-audio/gemini_key.txt` | Gemini API key. |
| This repo | The built site only (`index.html`, `data/`, `audio/`, icons, `version.json`). Rebuilt and pushed by the Mac. |
| Claude's cloud workspace `/home/claude/podcast/` | Working copy used while editing; anything changed there must be copied to the Mac (it is not the source of truth). |

Inside `podcast/` on the Mac:

| Path | Purpose |
|---|---|
| `v2/ep_XX.json` | Level 4 scripts: `{ep, title, summary, items[{item, gloss}], lines[{section, speaker, ko, style, en}]}`. `ko` may contain Gemini sound tags like `<laugh>`. |
| `v2/voices.json` | Scene voices per episode `{ep: {Jun, Sua, note?}}`. Commentary always uses the hosts. |
| `queue.txt` | Generation order (currently ep_01…ep_42 in number order). |
| `cast/ep_XX.json` | Chip names: `{main: {Jun, Sua}, other: {line index: name}}` for 장면 lines. |
| `overviews/ep_XX.json` | English `{blurb, overview, setting, register}` for the list and the "About this episode" box. |
| `titles_en.json` | English episode titles. |
| `zh/ep_XX.json` | Simplified Chinese per line; Traditional is generated with OpenCC `s2twp` at build time. |
| `tr/{de,fr,ru}/ep_XX.json` | German, French and Russian per line. `*word*` marks romanised Korean terms (shown in italics). |
| `ovl/{zh,de,fr,ru}.json` | Localised `{title, blurb, overview, setting, register}` per episode (`*term*` = italic); Traditional is OpenCC from `zh`. |
| `roman_terms.json` | Romanised Korean words that get `*…*` in the English lines. |
| `items.json` | Card details (meaning, example, notes, note id) used by the expression sheets. |
| `card_map.json` | Script item → the Grammar + Vocab card it stands for when the names differ. Cards are picked Grammar + Vocab first, then Expressions (which mostly repeat them), then deckless notes; items that resolve to the same card merge. |
| `note_decks.json` | Note id → current Anki deck, for tags like `4A.6 Grammar` / `4B.3 듣고 말하기 1`. |
| `hl_drop.json` | Highlights judged wrong by review: `[item, hit, line or null]`. |
| `player/index.html` | The app (single file). `player/icon-*.png` are the app icons. |
| `l3/v2/l3_XX.json`, `l3/plan.json` | Level 3 scripts (21 episodes, written, no audio yet, not in the site yet). |
| `cache/v2/<ep>/NN.wav` | Generated audio chunks (re-used across runs). |
| `audio/v2/<ep>.mp4`, `.chunks.json`, `.words.json`, `.chars.json`, `.voice.json` | Per-episode outputs. |
| `ready/<ep>.mp4`, `ready/<ep>.timing.json` | Finished episodes, picked up by the site build. |
| `gemini.log` | Log for every step (`[daily]`, `[align]`, `[whisper]`, `[publish]`). |
| `jobs/*.py` | One-off podcast jobs: run once at the start of the next podcast run, log to `jobs/<name>.log`, then moved to `jobs/done/`. |

## Daily flow (Mac, launchd `com.mancini.podcast`)

Runs at **16:15** and **17:15** Seoul time (Gemini's free quota resets at midnight Pacific: 16:00 KST in US summer
time, 17:00 in winter). `touch podcast/run_podcast.flag` runs it immediately. The Anki card job is separate (13:00).

1. `podcast_daily.py`: runs pending `jobs/`, then
2. `podcast_gemini2.py` (Anki's Python, which has working SSL): Gemini TTS `gemini-3.8-flash-tts`, conversational mode,
   ~2,600 characters per request (≈5 requests per episode, free tier = 10/day ⇒ ~2 episodes/day). Every line's style
   starts with a "same voice as before" anchor. Stops when the daily quota is hit (`quota_hit.txt`).
3. `podcast_whisper.py`: faster-whisper small, word timestamps per chunk.
4. `podcast_align.py`: torchaudio MMS_FA forced alignment per line → syllable times (`.chars.json`). Also a voice
   check (Resemblyzer GE2E encoder, `voice_encoder.pt`): a line closer to the other host's voice, or a chunk that
   drifts from the episode's average voice, gets its chunk deleted and remade once (costs a request).
5. Export to `ready/`, then `publish_site.py`: `build_player.py` → `build_site.py` → commit and push to this repo.

## Building the site

- `build_player.py` builds `player/data/ep_XX.json`, `index.json`, `search.json` from everything above. Per line:
  `i, s (section), p (speaker), c (chip name), ko, en, zh, zt, de, fr, ru, t/e (line start/end), w (word starts),
  cs (syllable start/end pairs), hl ([start, end, item] highlight spans)`. Episodes also carry `ovl` (localised overviews),
  index entries `loc` (localised title/blurb), and `search_<lang>.json` holds each search row's text in that language.
- Highlighting: `kiwi_hl.py` (kiwipiepy morphemes) plus a spelling fallback that conjugates verbs with Kiwi, pattern
  overrides for loose frames, then `hl_drop.json`. Bump `HLV` in `build_player.py` when the matcher changes (spans are
  cached per episode under that version).
- `OVERRIDES` in `kiwi_hl.py`: item → regex. A regex with groups highlights each group separately (split frames like
  `얼마나 … -은지`). `FUNCS` holds item → function for cases needing Kiwi (conditional `-아/어야`, not `해야 돼`).
  Items added there skip the spelling fallback. Unmatched on purpose: `-이/가 (새로운 정보)` and four duplicate cards
  whose twin in the same episode already holds the highlight.
- `build_site.py` wraps the app into a standalone page, copies `ready/*.mp4` to `audio/`, writes `version.json`
  (the app reloads itself when this changes) and the icons.

## App behaviour worth knowing

- The translation setting is also the interface language (None → English): every label comes from the `I18N`
  table in `index.html` (en, zh, zt, de, fr, ru). Add a key there for any new label. The language chip sits on
  the home page (globe) and in the player bar; both open the same menu.
- Wordmark follows the language: 팟캐스트 (no translation), Podcasts, 播客, Подкасты; Poppins ExtraBold for Latin.
- Speed steps: 0.7–1.2 in 0.1 steps; a stored speed snaps to the nearest step.
- The back-to-line pill shows whenever the current line leaves the middle band of the screen; its arrow points to it.
- Settings in localStorage: `tr` (translation: off/en/zh/zt/de/fr/ru), `size` (0–3), `speed`, `ovOpen`, `pos_<ep>`,
  `done_<ep>`.
- Grammar/expression marks are filled purple, vocab is dotted underline; tapping one opens its sheet (audio pauses
  and resumes on close).
- In translations, Hangul left in place is set apart (`.hg`) and `*romanised terms*` are italic (`.rk`).
- Scene voices differ per episode; commentary voices are always Achird (준) and Leda (수아). Ep 1's scene uses the
  host voices (it was recorded before per-episode voices existed).

## Conventions

- English: British spelling; game names capitalised (Gonggi, Ttakji); 막내 translated in context.
- Chinese: names stay in Hangul. de/fr: romanised names like the English; ru: Kontsevich (Чун, Тоюн).
- Episode numbers are the script order; generation follows `queue.txt` (number order).
- Two voices per Gemini request is a hard limit, so every script is two speakers; side roles are voiced by the host of
  the same gender.

## Adding a level (e.g. Level 3)

1. Export the cards (Anki one-off), plan episodes, write `l3/v2/*.json` (done for Level 3: `l3/WRITE_SPEC.md`).
2. Add overviews, cast, translations; extend `build_player.py` to read `l3/` and give episodes a level.
3. Add the level's episodes to `queue.txt` when audio should start.
4. The list page groups episodes under a level heading.

## Status and open items (keep current)

- On hold until Mancini says go (after his usage resets):
  1. Level 3 scripts into the player (`l3/v2`, 21 episodes, script-only at first).
  2. Full translations of card text (gloss, meaning, example translation, notes) into zh/de/fr/ru for both levels
     (~1,551 Level 4 cards; zt via OpenCC). Done after Level 3, in one pass.
- Level 3 Anki deck sort: waiting for photos of the 3A and 3B handbooks (unit banners/contents + vocab pages). Target
  layout mirrors Level 4 (`Sogang Level 3A::3A Grammar + Vocab::Unit N::3A Unit N · Grammar / · Vocab::듣고 말하기 …`).
  The pages sent so far were 4A (already sorted). Open: whether `이야기를 나누다` (in Sogang 3 Vocab) belongs in 4A.2.
- Open question: rename the browser tab / home-screen name from "Sogang Podcasts" (clashes with Apple Podcasts if just "Podcasts").
- Syncing to the Mac: `device_commit_files` can leave a stale copy, and a Mac publish then overwrites GitHub with it.
  Commit under a new filename, check md5 on the Mac, then copy into place before touching `run_podcast.flag`.
