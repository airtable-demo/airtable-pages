# BRIEF — Palette | Block & Item Painter
You own TWO files: /agent/workspace/vc2/12_blocks.js and /agent/workspace/vc2/14_items.js.
Read /agent/workspace/vc2/HARNESS.md (V3-V5 addendums) first. Match the existing painter style in each file.

## 12_blocks.js
1. WOOL block, id 27 EXACTLY: BLOCKS[27]={n:'Wool',t:[T,T,T]} (normal solid opaque cube). Paint a new atlas tile:
   soft white #e8e6e0 base with light gray weave speckle (#d5d2ca / #f4f2ec), subtle 4px knit rows. Atlas is 8x8 of 32px — use the next free tile index (check the current painter comments for the highest used index and take the next one).
2. PCOL[27]=0xe8e6e0.
3. HOTBAR_SETS: append a THIRD page: [27 (WOOL), ICE, SPRUCELEAF, LEAF, LOG, PLANK, GLASS, BRICK, SNOWBLK] (use the existing constants). X key already cycles pages by array length.

## 14_items.js
1. ITEMS[103]={n:'Beef',icon:<next free>,food:8} — steak icon: red-brown slab, lighter marbling streaks, chunky pixels.
2. ITEMS[104]={n:'Chicken',icon:<next free>,food:5} — drumstick icon: tan meat lobe + white bone end.
   Both painted on the item atlas (4x4 of 32px — tiles 10+ are free), transparent backgrounds (clearRect first).
No other changes. Eating works automatically via ITEMS[id].food.

## Constraints
Top-level side effects only for atlas painting (existing pattern). Keep all existing names working.
node --check BOTH files AND python3 /agent/workspace/vc2/build_vc.py --check-only must pass.
Only edit your two files. Return JSON {files,features,check,notes}.
