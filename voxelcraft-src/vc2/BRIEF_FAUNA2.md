# BRIEF — Fauna2 | Mob Wrangler (v3 touch-up)
You own /agent/workspace/vc2/35_mobs.js (exists — v2 mob system).
Read /agent/workspace/vc2/HARNESS.md (incl. V3 ADDENDUM). Small, surgical changes only.

## Changes
1. PIG DROPS: where a pig dies from hitMob damage (hp<=0 removal path), add:
   if(typeof gamemode!=='undefined'&&gamemode==='survival'&&typeof invAdd==='function'){
     invAdd(101,1+(Math.random()<0.5?1:0));
     if(typeof toast==='function')toast('+ Porkchop');
   }
   Zombies drop nothing.
2. SWORD DAMAGE: in hitMob(), damage = 4 normally; if selected item is STONE_SWORD (116) via
   typeof getSelectedItemId==='function'&&getSelectedItemId()===116 -> damage 8 and knockback *1.3.
3. No other behavior changes. Keep every existing function/var name.

## Checks + return
node --check your file AND python3 /agent/workspace/vc2/build_vc.py --check-only. Only edit 35_mobs.js.
Return JSON {files,features,check,notes}.
