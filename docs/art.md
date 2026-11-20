# Art and sound sources

The app ships only the images and sounds in `assets/`, which our scripts build from purchased packs. The packs
themselves stay out of git, in the ignored `assets/vendor/`. Credits and license summaries that ship with the app
are in `scripts/notices.mjs`.

## The packs

| Pack | Author | Folder under `assets/vendor/` | License in short |
|---|---|---|---|
| Modern Interiors | LimeZu | `1_Interiors`, `2_Characters`, `3_Animated_objects`, `4_User_Interface_Elements` | Changes and commercial use allowed. No resale or redistribution of the assets. Credit required. |
| Modern Exteriors | LimeZu | `Modern_Exteriors_16x16` | As above. |
| Modern Farm | LimeZu | `Modern_Farm` | As above; credit is requested. |
| Modern UI SFX | Cyberleaf Studio | `sfx/Cyberleaf-ModernUISFX` | Commercial use allowed. No redistribution or remixing for release. |
| LXGW WenKai Screen | LXGW | `fonts/lxgw-wenkai-screen-webfont` | SIL OFL 1.1. npm package `lxgw-wenkai-screen-webfont`. |

Read the license file in each pack before relying on this table. Because the assets may not be redistributed, this
repository must stay private.

## What the installer carries

Only the pictures our scripts write to `assets/`: whole scenes, furniture layers, overlays and character sheets,
composed from the packs and often recoloured or redrawn in part. They are packed inside the app's `app.asar`. No tile
sheet, single tile or generator part from a pack ships as a file of its own. LimeZu is credited in Settings, with a link
to the itch.io page.

Whether this counts as redistribution under LimeZu's licence has not been asked yet. The question is written at the end
of `docs/art-1.4.md` (Q-D3 in `docs/road-to-1.4.md`), and 1.4 is not released until the answer is in.

## Setting up on Windows

Point `assets/vendor/` at the unpacked packs with junctions, one command per pack. Run these in PowerShell from the
repository root, with the packs unpacked in `Downloads`:

```powershell
New-Item -ItemType Junction -Path assets\vendor\1_Interiors -Target "$HOME\Downloads\moderninteriors-win (1)\1_Interiors"
```

```powershell
New-Item -ItemType Junction -Path assets\vendor\2_Characters -Target "$HOME\Downloads\moderninteriors-win (1)\2_Characters"
```

```powershell
New-Item -ItemType Junction -Path assets\vendor\3_Animated_objects -Target "$HOME\Downloads\moderninteriors-win (1)\3_Animated_objects"
```

```powershell
New-Item -ItemType Junction -Path assets\vendor\4_User_Interface_Elements -Target "$HOME\Downloads\moderninteriors-win (1)\4_User_Interface_Elements"
```

```powershell
New-Item -ItemType Junction -Path assets\vendor\Modern_Exteriors_16x16 -Target "$HOME\Downloads\modernexteriors-win\Modern_Exteriors_16x16"
```

```powershell
New-Item -ItemType Junction -Path assets\vendor\Modern_Farm -Target "$HOME\Downloads\Modern_Farm_v1.2"
```

The scripts need Pillow (`pip install pillow`), and `scripts/art/font.py` also needs fontTools and Brotli.

## The scripts

Run a script from the repository root with `python scripts/art/<name>.py`. PNGs are written with new bytes even when
no pixel changed, so compare pixels and restore unchanged files before committing.

| Script | Builds |
|---|---|
| `scene.py` | The cafe background, and the back door in the near wall (`back-door.png`, drawn by the script). Calls `rug.py`. Run `furnish.py` afterwards. |
| `study.py` | The study background. Run `furnish.py` afterwards. |
| `rug.py` | The cafe's rug and the bench's top edge, and can repaint an existing `cafe.png`. |
| `furnish.py` | The wall, curtain and rug colour overlays for each scene. |
| `pieces.py` | Splits `cafe.png` and `study.png` into the empty room and the furniture, with depths for the game and boxes for the walks (`pieces.json`). Run last, after anything that changes a room or an overlay. |
| `decor.py` | Holiday and weather overlays. |
| `garden.py`, `animals.py` | The back garden and its animals. |
| `street.py` | The street seen through the small inset. |
| `characters.py`, `portraits.py` | Staff sprite sheets, then portraits from those sheets. |
| `emotes.py` | The mood bubble strip. |
| `garden.py` | The garden, and `garden-crops.png` (what comes up in the beds; the sprout is drawn by the script). |
| `tools.py` | The toolbar icons. Drawn by the script, no pack needed. |
| `growth.py` | What the shop gathers, and the works shelf icons. |
| `font.py` | The handwriting font subset. |
| `icon.py`, `paper.py` | The app and tray icons, and the paper grain. Drawn by the script, no pack needed. |

Sounds are built by `scripts/audio/sfx.py`, which also needs ffmpeg with libvorbis.

## What the packs do not have

Checked against the character generator's guide and the pack file names on 2026-11-04:

- No drinking or writing animation for characters.
- No walking cat: `animated_cat` is lying down only.
- No walking while carrying something. A book, a phone, a gift box and a cart exist only inside their own animations.
