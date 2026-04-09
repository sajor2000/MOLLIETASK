# Design assets (unzipped for agents)

Stitch exports were extracted from the repo zips into `stitch-exports/`.

## Layout

| Folder | Source archive | Screen (from HTML) |
| --- | --- | --- |
| `stitch-exports/screen-01/` | `stitch.zip` | Main productivity UI; HTML title references Kanban (Stitch default — **PRD specifies list app, not Kanban**). |
| `stitch-exports/screen-02/` | `stitch (1).zip` | Sidebar + **Calendar** grid (month view). |
| `stitch-exports/screen-03/` | `stitch (2).zip` | **Task detail bottom sheet** over blurred Kanban-style placeholder. |

Each folder contains:

- `code.html` — Tailwind + Inter + Material Symbols reference markup
- `screen.png` — raster mock
- `DESIGN.md` — shared design system doc (“The Silent Editor” / Digital Sanctuary); identical copy in all three folders

## Product docs

- [`docs/dental-task-os-PRD.md`](../docs/dental-task-os-PRD.md) — PRD (versioned in git)
- `dental-task-os-spec (2).docx` — full technical spec (kept locally at repo root if present; not committed by default)

## One-file bundle

`dental-task-os-design-agent-bundle.zip` at repo root includes `design/stitch-exports/`, the PRD, and the spec docx for attaching or uploading elsewhere.
