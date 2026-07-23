# BRIEF — Pulse2 | Systems Medic (v3 rework)
You own /agent/workspace/vc2/45_survival.js (it exists — your v2 code).
Read /agent/workspace/vc2/HARNESS.md (incl. V3 ADDENDUM) fully. Read 40_player.js (tryEat/tryConsume/
onBlockMined/survivalMineTick call sites) and know module 47 (Satchel) now OWNS the inventory store:
invAdd/invTake/invCount are its API (typeof-guard them; if absent, degrade to v2 local object behavior).

## Mission
Hunger, tool-gated harvesting, tool-scaled mining speed, eating. Keep all v2 systems working.

## Changes
1. DELETE your v2 local inventory object + refreshCounts (Satchel owns them now). Keep hp/air/death/fall/regen.
2. HUNGER: hunger=20. survivalTick additions: drain = 0.014/s base + 0.10/s while sprinting (hsp>5.6 — read
   var via Math.sqrt(P.vx*P.vx+P.vz*P.vz)) + 0.05 per jump (detect P.vy>7 rising edge) + 0.03/s while mining var is true.
   Regen ONLY when hunger>=18 (each regenerated hp costs extra 0.4 hunger). hunger<=0: starvation 1 dmg/3s
   but never below hp=2. Render #hunger as 10 drumstick glyphs (use '\uD83C\uDF57' emoji OR colored circles
   spans class hf/he) right-aligned, only re-render on change, hidden in creative (survivalOnGamemode).
3. tryEat(id): survival only; it=ITEMS[id] (guard typeof ITEMS); if !it||!it.food return false; if hunger>=19.5
   toast('Not hungry')+return true (consumed the click, not the item); if invTake(id,1): hunger=min(20,hunger+it.food),
   blip(150,90,0.2,0.09), refreshCounts (guard), return true. Else false.
4. TOOL GATING in mining: helper toolInfo(): var id=(typeof getSelectedItemId==='function')?getSelectedItemId():null;
   return ITEMS[id] with its tool/tier or null.
   canHarvest(blockId): needsPick table per harness (STONE/COBBLE/SANDSTONE/BRICK/ICE/COAL_ORE tier1,
   IRON_ORE tier2, GOLD_ORE/DIAMOND_ORE tier3): require tool==='pick' && tier>=req. Everything else true.
   survivalMineTick speed: base = hardness(id) as v2; if wrong/no tool on a needsPick block: time *= 3.5;
   if correct CLASS tool held (pick on pick-class, axe on LOG/PLANK, shovel on DIRT/GRASS/SAND/SNOWGRASS/SNOWBLK):
   time /= (2 + 2*(tier-1)) capped at 8 (wood2x stone4x iron6x diamond8x; axe/shovel tier1 = 2x).
5. onBlockMined(id): if !canHarvest(id) -> NO drop (still return). Drops mapping from v2 PLUS: LEAF -> 8% APPLE
   (else nothing); use invAdd (guard). Toast nothing (no spam).
6. survivalOnGamemode(m): also show/hide #hunger; call buildHotbar() (guard typeof) so hotbar mode switches.
7. survivalOnRespawn(): hp=20, air=10, hunger=20.
KEEP function names identical to v2 for everything else. No new event listeners. Lazy DOM.

## Checks + return
node --check your file AND python3 /agent/workspace/vc2/build_vc.py --check-only. Only edit 45_survival.js.
Return JSON {files,features,check,notes}.
