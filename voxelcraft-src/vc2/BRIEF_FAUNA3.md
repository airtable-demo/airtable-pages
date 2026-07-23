# BRIEF — Fauna3 | Mob Wrangler (finalization pass)
You own /agent/workspace/vc2/35_mobs.js (your v2 code + Fauna2 drops/sword edits).
Read /agent/workspace/vc2/HARNESS.md (V3-V5 addendums). The game world now has a random seed and varied spawn.

## Missions
1. NEW ANIMALS — sheep, cow, chicken (plus existing pig, zombie):
   - Sheep: white boxy body (slightly bigger than pig), gray face box, 4 dark legs. Drops 1-2 WOOL (id 27) via invAdd in survival.
   - Cow: brown body, white patches (use a second material or smaller white boxes), horns optional. Drops 1-2 BEEF (103).
   - Chicken: small (0.5 scale), white body, yellow beak box, 2 legs, slight bob/waddle. Drops 1 CHICKEN_MEAT (104).
   - All passive: same wander AI as pig (reuse/generalize your pig logic into a species config table — color(s), size, speed, sounds, drops, hp: pig 6, sheep 6, cow 8, chicken 3).
   - Ambient sounds per species via blip (pig oink 340->260, sheep baa 300->240 longer, cow moo 180->120 long, chicken cluck 500->420 short).
2. SPAWN FIX (critical — animals currently never appear in snow biomes): passive animals spawn on GRASS **or SNOWGRASS** (id 13); chickens may also spawn on SAND. Use findGroundY + getBlock at (y-1). Spawn 14-40 blocks from player. Caps: total passive 14 within 75 of player (mix species randomly, chickens slightly more common), despawn beyond 90. Zombies unchanged (night, cap 6).
3. HIT FEEL (mobs must feel hittable):
   - Widen attack: range 4.0 (was ~3.6), cone dot>0.88 (was 0.94), pick the NEAREST mob in cone.
   - On hit: red flash (you have hurtT), knockback, blip(200,120,0.08,0.12), small burst() at the mob (color per species) — every hit, not just kills.
   - On kill: bigger burst, drops via invAdd (survival only, guard typeof) + toast('+ Wool'/'+ Beef'/etc), free the slot.
   - Sword bonus unchanged (STONE_SWORD id 116 -> dmg 8).
4. NEW GLOBAL: function mobUnderCrosshair() -> bool. Same cone test (range 4.0, dot>0.88) against all live mobs, cheapest possible (no allocs in the loop if easy), NO side effects. Core calls it every frame for crosshair tint.

## Constraints
Keep every existing global name working (initMobs/updateMobs/hitMob). Top-level declarations only.
No sleep. node --check your file AND python3 /agent/workspace/vc2/build_vc.py --check-only must pass.
Only edit 35_mobs.js. Return JSON {files,features,check,notes}.
