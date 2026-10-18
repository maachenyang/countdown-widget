# Countdown

A minimal countdown widget that sits on your Windows desktop. Frosted glass card, big light digits, no clutter.

**[中文说明](README.zh-CN.md)**

![Light theme](preview/light.png)

| Dark | Accent color |
| --- | --- |
| ![Dark theme](preview/dark.png) | ![Accent](preview/accent.png) |

![Settings](preview/settings.png)

---

## Features

- **Frameless frosted-glass card** — 26px rounded corners, hairline border, soft shadow. Sits on the desktop and stays out of the way.
- **Multiple countdowns** — exam, birthday, release date… switch with the scroll wheel, `←` `→`, the dots under the card, or the tray menu.
- **Per-item accent color** — the big number, the status dot and the progress bar all follow it.
- **Light / dark / follow-system** themes.
- **Zoom 80%–180%** — `Ctrl` + wheel, or pick S / M / L / XL. Window and fonts scale together, so the layout never breaks.
- **Drag anywhere**, position is remembered.
- **Lives in the tray** — click to show/hide, right-click for settings, always-on-top, launch at login, quit.

## Download

Grab the latest build from [Releases](https://github.com/maachenyang/countdown-widget/releases):

| File | Notes |
| --- | --- |
| `Countdown-*-portable.exe` | Single file, ~96 MB, no installation. Copy it anywhere. |
| `Countdown-*-win-x64.zip` | Unpacked folder. Use this if the portable exe complains about temp files. |

`config.json` is created next to the executable, so the whole thing is portable.

> Unsigned build — Windows SmartScreen may warn on first run. Click **More info → Run anyway**.

## Usage

| Action | Result |
| --- | --- |
| Drag the card | Move it around (position is saved) |
| **Scroll wheel** | Switch to the next / previous countdown |
| `←` / `→` | Same, with the keyboard |
| **Ctrl + wheel** | Zoom the whole widget in / out |
| **Double-click the card** | Open settings |
| **Right-click** the card or the tray icon | Context menu |
| `Esc` | Step back (on the card view: hide to tray) |
| `Enter` | Open settings (on the card view) |

## Settings

Double-click the card:

- **倒计时条目 (Countdowns)** — the list. Click a row to edit: name, target date, optional start date (drives the progress bar), accent color. **＋ 添加倒计时** adds one, **删除** removes it.
- **外观 (Appearance)** — theme, glass mode, size, always-on-top.
- **Glass modes** — `标准` (real 26px radius, translucent card) · `亚克力` (Windows 11 system backdrop blur) · `不透明` (solid — the safe fallback if transparency misbehaves).

![Editing a countdown](preview/editor.png)

## Configuration file

Everything lives in `config.json` next to the executable:

```json
{
  "version": 2,
  "items": [
    {
      "id": "i1",
      "title": "考研初试",
      "targetDate": "2026-12-19",
      "startDate": "2026-09-01",
      "accent": "#1C1C1E"
    }
  ],
  "activeId": "i1",
  "theme": "light",
  "glass": "css",
  "scale": 1,
  "alwaysOnTop": false,
  "openAtLogin": false,
  "bounds": null
}
```

| Key | Meaning |
| --- | --- |
| `title` | Label shown on the card |
| `targetDate` | The day being counted down to (`YYYY-MM-DD`) |
| `startDate` | Optional. Progress = elapsed / total between start and target |
| `accent` | One of `#1C1C1E` `#0A84FF` `#34C759` `#FF9500` `#FF3B30` `#AF52DE` |
| `theme` | `light` \| `dark` \| `auto` |
| `glass` | `css` \| `acrylic` \| `solid` |
| `scale` | `0.8` – `1.8` |

Configs from older single-countdown versions are migrated automatically.

## Build from source

```bash
npm install
npm run verify      # syntax + rendering logic self-check (headless)
npm run dragtest    # window drag / zoom regression test
npm start           # run from source
npm run dist        # package into dist/
```

Fonts: [Inter](https://github.com/rsms/inter), bundled as a woff2 (OFL). Chinese text falls back to the system font (DengXian / Microsoft YaHei).

## Troubleshooting

**`Error writing temporary file. Make sure your temp folder is valid.`**
The portable exe extracts itself into `%TEMP%`. If that folder is locked down or unwritable, put `launcher-compat.bat` next to the exe and double-click that instead (it points `TEMP` next to the exe), or use the unpacked zip build.

**Nothing appears after launching.**
Chromium's process sandbox cannot start inside some restricted environments (containerized sessions, certain security policies). Run the exe with `--no-sandbox`.

**`Cannot read properties of undefined (reading 'setPath')`**
Something in your environment sets `ELECTRON_RUN_AS_NODE`, making Electron behave like plain Node. Clear it: `set ELECTRON_RUN_AS_NODE=`.

## Platform

Windows 10/11 x64. Built with Electron — the shell integration (tray icon, acrylic backdrop, frameless transparent window) is Windows-specific.

## License

[MIT](LICENSE)
