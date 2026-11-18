# Crustacean sprite format changelog

## Format 2

Library 0.2.0 reads formats 1 and 2. Library 0.1.0 reads format 1.

- Format 2 adds optional `visual_anchors` metadata. Each named point is an
  integer `[x, y]` inside the unscaled cell, measured from the top-left. Atlas
  gutters are excluded.
- `defaults` defines sprite-wide points. `frames` maps zero-based atlas indices
  to sparse overrides. A frame point takes precedence over the sprite default
  for that name. Both maps are optional.
- To author anchors in a format 1 file, set `"version": 2` and add the metadata
  alongside the existing fields. For a cell at least 15 pixels wide and tall,
  one example is `"visual_anchors": { "defaults": { "body": [14, 14] } }`.
- `resolveVisualAnchor(definition, frame, name)` returns the authored point or
  `undefined`. Applications can supply their own defaults for missing points.
- Format 2 accepts `[0, 0, 0, 0]` for an unset hitbox, as used by Dredmor's hero
  atlases.

## Format 1

The original format defines the atlas image, frame grid, animations, hitbox, and
optional palette.
