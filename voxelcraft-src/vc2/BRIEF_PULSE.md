# BRIEF — Pulse | Systems Medic
You own ONE new file: /agent/workspace/vc2/45_survival.js (create it).
Read /agent/workspace/vc2/HARNESS.md first. Read base_game.js + 50_game.js + 40_player.js to see your hook call-sites.

## Mission
Survival systems: health, fall damage, drowning, death, block drops + counted inventory, mining hardness/progress.

## DOM already present for you
#hearts (container), #bubbles, #mineprog (hidden bar) + #mineprogF (fill), death overlay handled by core
(you just call playerDied(cause)). Hotbar counts render via setSlotCounts(countsOrNull).

## Required globals (exact names — core calls them with typeof guards)
- function damagePlayer(n, cause)      [no-op in creative or when dead]
- function onFallImpact(speed)         [called with |vy| >= 11; dmg = Math.ceil((speed-11)*0.55); cause 'Fell from a high place']
- function survivalTick(dt)            [regen: +1 hp per 4s when hp<20 and not recently damaged (5s);
                                        drowning: eyeInWater() -> air 10 -> 0 over 10s, then 2 dmg/1.5s 'Drowned';
                                        refill air fast when out; render hearts + bubbles here (cheap DOM, only on change)]
- function survivalMineTick(dt, ray) -> bool   [accumulate progress on the targeted block; if ray target changed, reset;
                                        progress += dt / hardness(id); show #mineprog (display block, width %);
                                        return true exactly once when progress >= 1, then reset]
- function survivalMineReset()         [hide #mineprog, clear progress]
- function onBlockMined(id)            [in survival: add DROPS[id] to inventory, toast tiny? no toast spam — just count;
                                        refresh hotbar counts]
- function tryConsume(id) -> bool      [creative: always true. survival: inventory[id]>0 ? decrement+refresh+true : toast('Out of '+name)+false]
- function survivalOnGamemode(m)       [creative -> setSlotCounts(null); survival -> refresh counts display]
- function survivalOnRespawn()         [hp=20, air=10, re-render]
- function refreshCounts()             [setSlotCounts(gamemode==='survival'?inventory:null)]

## Data
hp=20 (render as 10 hearts, half hearts rounded: use hearts chars '\u2665' spans class hp/hd), air=10 bubbles '\u25cf'
(#bubbles only visible while air<10). Inventory = plain object {id:count}, START with a few freebies:
{1:0} empty actually — start empty; creative ignores it.
HARDNESS (seconds to mine): LEAF/TALLGRASS/FLOWER*/TORCH 0.05; GRASS/DIRT/SAND/SNOWGRASS/SNOWBLK 0.45;
LOG/PLANK/CACTUS 0.7; GLASS/ICE 0.25; STONE/COBBLE/SANDSTONE/BRICK 1.1; COAL_ORE 1.3; IRON_ORE 1.6;
GOLD_ORE 1.4; DIAMOND_ORE 2.2; WATER/BEDROCK Infinity (bedrock handled by core anyway). Default 0.6.
DROPS: GRASS->DIRT, STONE->COBBLE, SNOWGRASS->DIRT, TALLGRASS->nothing, FLOWER_R/FLOWER_Y->themselves,
LEAF->nothing (85%) or LOG sapling? no: nothing, ICE->nothing, everything else -> itself.
Damage feedback: red vignette flash (create ONE fixed div yourself with id you own e.g. #dmgflash, or reuse
burst+blip) — keep it simple: blip(90,50,0.2,0.12) + brief document.body style filter? No body filters; a quick
opacity pulse on your own overlay div is fine (you may create this ONE div via JS at init).
Death: hp<=0 -> playerDied(cause). Guard: never damage when gamemode==='creative' or dead.

## Constraints
- Top-level: declarations only; lazy-init DOM refs inside functions (elements exist by runtime).
- Only file you may edit/create: 45_survival.js. No new event listeners except none. No sleep.
- node --check + python3 /agent/workspace/vc2/build_vc.py --check-only must pass.
Return the JSON per harness.
