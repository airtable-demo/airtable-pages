# VOXELCRAFT v2 — BUILD HARNESS (read fully before editing)

## What this is
A browser Minecraft in ONE html file, assembled from modules in /agent/workspace/vc2/.
Modules are concatenated IN FILENAME ORDER into a single IIFE <script>. Three.js r128 is inlined.
Full v1 game source for reference: /agent/workspace/vc2/base_game.js (do not edit).

## Absolute rules
1. Edit ONLY the file(s) you own. Never touch other modules, build_vc.py, or html files.
2. Function declarations hoist across all modules — call any listed API at RUNTIME freely.
   BUT top-level `var` initializers run in file order. Your module's top-level code must ONLY
   declare functions and plain data. Any config data another module's runtime might need must
   live INSIDE your functions (module 32 especially: genChunk is called before your top-level vars init? No —
   genChunk is first called from 50_game which runs last, so your top-level vars ARE initialized by then.
   Still: keep top-level side effects to zero unless your brief says otherwise).
3. Style: plain ES5-ish JS (var, function declarations). ES6 syntax parses but NO import/export,
   NO async/await, NO template literals with ${} interpolation of user data. No external URLs/assets —
   everything procedural.
4. NEVER use Bash sleep / setTimeout-based polling in your own workflow. Just edit and check.
5. Self-check loop: after editing run BOTH:
     node --check /agent/workspace/vc2/<yourfile>.js
     python3 /agent/workspace/vc2/build_vc.py --check-only
   Fix until both pass. 3 consecutive identical failures = stop and report the error.
6. Do not rename/remove ANY existing function or var. Additive + specified edits only.

## Canonical block ID map (FIXED — use these exact numbers)
AIR=0 GRASS=1 DIRT=2 STONE=3 SAND=4 LOG=5 LEAF=6 PLANK=7 GLASS=8 BRICK=9 COBBLE=10 WATER=11 BEDROCK=12
NEW: SNOWGRASS=13 SNOWBLK=14 ICE=15 CACTUS=16 SANDSTONE=17 SPRUCELEAF=18 FLOWER_R=19 FLOWER_Y=20
     TALLGRASS=21 COAL_ORE=22 IRON_ORE=23 GOLD_ORE=24 DIAMOND_ORE=25 TORCH=26

## Shared API you may call at runtime (defined in core modules)
- getBlock(wx,wy,wz,fallback) -> id     [pass AIR as fallback for gameplay logic]
- setBlock(wx,wy,wz,id) -> bool         [records edit + remesh; use for gameplay changes only]
- isSolid(id), isOpaque(id)             [registry-driven after Terra's patch]
- findGroundY(wx,wz) -> y of first air above ground
- terrainH(wx,wz)                       [raw terrain height, pre-edit]
- BLOCKS registry, HOTBAR (current set), CH=16, WH=64, SEA=24
- P = player {x,y,z,vx,vy,vz,grounded,fly}; yaw, pitch; gamemode ('survival'|'creative'); state; dead
- eyeInWater(), inWater()
- toast(msg), blip(f0,f1,durSec,vol), burst(x,y,z,hexColor)  [particles]
- h2(x,z), h3(x,y,z) -> deterministic [0,1); fbm2(x,z,oct); noise2; noise3; mulberry32(seed)
- isNight() -> bool; skyK 0..1 (1=noon)
- scene, camera, THREE (r128), atlasC (atlas canvas), tileXY(t), TS=32, ACOLS (atlas cols)
- setSlotCounts(countsObjOrNull)        [render counts on hotbar slots]
- playerDied(causeText), spawnY
- damagePlayer(n, cause)                [defined by module 45 — guard with typeof if you call it]

## Check + return
When done: run the two checks, then return ONLY a JSON object:
{"file(s)": [...], "features": [...], "check": "pass", "notes": "..."}


# ===================== V3 ADDENDUM (hunger / tools / inventory) =====================

## ITEM ID MAP (FIXED — items are NON-BLOCK ids >= 100)
STICK=100 PORKCHOP=101 APPLE=102
WOOD_PICK=110 STONE_PICK=111 IRON_PICK=112 DIAMOND_PICK=113
WOOD_AXE=114 WOOD_SHOVEL=115 STONE_SWORD=116
Blocks stay 1..26. Rule: isBlockId(id) => id>0 && id<100 (defined in module 14).

## Module order (concat): 10,12,14_items,20,30,32,35,40,45,47_inventory,50
Function declarations hoist across all modules; call cross-module functions at runtime freely,
ALWAYS with typeof guards for anything from modules 14/35/45/47.

## v3 shared API (who defines what)
Module 14 (Pigment): ITEMS registry, itemAtlasC, drawItemIcon(ctx2d,id,dx,dy,size), isBlockId(id), iconAny(ctx2d,id,size) optional.
Module 45 (Pulse2): hunger system, tryEat(id)->bool, canHarvest(blockId,toolId)->bool, miningSpeed rules inside survivalMineTick, onBlockMined drops (harvest-gated) -> invAdd, tryConsume(id)->bool (creative true; survival delegates invTake), damagePlayer/onFallImpact/survivalTick as before.
Module 47 (Satchel): inventory store + persistence (localStorage key 'voxelcraft_inv_v1'), invAdd(id,n), invTake(id,n)->bool, invCount(id)->n, getHotbarSlots()->array(9) of id|null, setHotbarSlot(i,id), getSelectedItemId()->id|null (survival: hotbarSlots[sel]; creative: HOTBAR[sel]), renderInventory() (fills #invGrid + #craftList), refreshCounts() (updates hotbar count badges via setSlotCounts or directly).
Core (already built, call freely): buildHotbar(), setSlotCounts(countsOrNull), selSlot(i), sel (selected index var), openInventory/closeInventory, drawSlotIcon(ctx,id), slotName(id), state can now be 'inv'.

## DOM available: #hunger (render drumstick-style spans: class hf=full, he=empty), #invGrid, #craftList, .icell/.icnt/.crow CSS classes exist (see 00_head.html).

## Recipes (canonical list for module 47)
1 LOG -> 4 PLANK
2 PLANK -> 4 STICK
3 PLANK + 2 STICK -> WOOD_PICK
3 COBBLE + 2 STICK -> STONE_PICK
3 IRON_ORE + 2 STICK -> IRON_PICK
3 DIAMOND_ORE + 2 STICK -> DIAMOND_PICK
3 PLANK + 2 STICK -> WOOD_AXE
1 PLANK + 2 STICK -> WOOD_SHOVEL
2 COBBLE + 1 STICK -> STONE_SWORD

## Tool gating (canonical for module 45)
Pick tiers: WOOD_PICK=1 STONE_PICK=2 IRON_PICK=3 DIAMOND_PICK=4.
Blocks REQUIRING a pick to drop: STONE,COBBLE,SANDSTONE,BRICK,ICE tier1; COAL_ORE tier1; IRON_ORE tier2; GOLD_ORE tier3; DIAMOND_ORE tier3.
Wrong/no tool: block still breaks at 3.5x slower, but drops NOTHING.
Speed multipliers when correct tool class held: pick on stone-class, axe on LOG/PLANK, shovel on DIRT/GRASS/SAND/SNOWGRASS/SNOWBLK: wood 2x, stone 4x, iron 6x, diamond 8x (axe/shovel are wood-tier: 2x).
Food: PORKCHOP restores 8 hunger, APPLE 4. APPLE drops from LEAF mining at 8% (harvest always allowed by hand).
GRASS->DIRT, STONE->COBBLE etc drop mappings stay from v2.


# ===================== V4 ADDENDUM (chat + nooks dock) =====================
## New modules: 48_chat.js (Herald), 49_nooks.js (Porter). Concat order: ...45,47,48,49,50.

## Core hooks ALREADY WIRED (call sites live, typeof-guarded — implement the names EXACTLY):
- 40 keydown calls chatKeydown(e)->bool FIRST; return true = event consumed by chat (game skips it entirely).
- canvas mousedown closes chat via closeChat() when isChatOpen().
- tryLock() auto-skips when isChatOpen() or nooksVisible() — closing chat/nooks may call tryLock() to restore.
- suppressNextUnlockPause() (core): call RIGHT BEFORE document.exitPointerLock() so the game doesn't auto-pause.
- clearKeys() (core): call when opening chat so held movement keys stop.
- Unlocked mouse-look only applies when e.target===canvas, and is disabled entirely while global var
  nooksDragging is true (Porter: declare `var nooksDragging=false;` and set during drag/resize).
- setTimeOfDay(v) exists (0..1; 0.28 morning, 0.25 noon-ish, 0.78 night).
- 50 wires #chatBtn click -> openChat('').

## DOM ready in 00_head.html:
- #chatlog (message stack), #chatwrap + #chatline input (display:none until open), .cmsg/.cmsg.sys/.cmsg.err CSS.
- #nooksPanel (display:none, flex column): #nooksHead (drag bar) with #nooksPop and #nooksClose buttons,
  #nooksFrame iframe (allow="microphone; camera; autoplay; clipboard-read; clipboard-write"), #nooksBar with
  #nooksOpenWin button + #nooksNote span, #nooksResize corner handle.

## Required globals — 48_chat.js (Herald)
isChatOpen()->bool, openChat(prefillStr), closeChat(), chatKeydown(e)->bool, addChatMsg(text, cls) [cls '' | 'sys' | 'err'].

## Required globals — 49_nooks.js (Porter)
nooksVisible()->bool, openNooks(), closeNooks(), var nooksDragging=false.
NOOKS_URL='https://app.nooks.in/workspaces/BgmZYqqdgcXM6pMS/settings/notifications?floorId=SUAIckPmRXjiji53'

## FACT (verified via response headers): app.nooks.in sends CSP frame-ancestors allowing ONLY nooks.in domains
and their Chrome extensions. Our origin is not allowed -> the iframe WILL be blocked by the browser. Still set
iframe src on first open (harmless, future-proof), but the PRIMARY working path is the popup window.


# ===================== V5 ADDENDUM (finalization: animals, hit feel, wool/food) =====================
## New/changed IDs (FIXED): WOOL=27 (block). Items: BEEF=103 (food 8), CHICKEN_MEAT=104 (food 5).
## World seed is now RANDOM per world: global SEED (number), SPAWNX/SPAWNZ/spawnY globals exist. h2/h3/fbm2 already use SEED.
## Core now calls (typeof-guarded): mobUnderCrosshair()->bool every frame for crosshair tint — must be CHEAP and side-effect-free.
## Sprint: double-tap W or Ctrl. Hunger drain for sprint already handled in 45 via horizontal speed.


# ===================== V6 ADDENDUM (furnace, smelting, item economy) =====================
## New FIXED ids
Block: FURNACE=31 (atlas tiles 34 side-with-mouth, 35 plain top).
Items: IRON_INGOT=105, GOLD_INGOT=106, DIAMOND=107, COAL=108, IRON_SWORD=117 {tool:'sword',tier:3},
STEAK=120 {food:10}, COOKED_CHICKEN=121 {food:8}, COOKED_PORKCHOP=122 {food:10}, GOLDEN_APPLE=123 {food:20,heal:20}.
Module 14 MUST also define var constants with these exact names (COAL, DIAMOND, IRON_INGOT, GOLD_INGOT etc) —
modules 45/47 reference them by name with typeof guards.
## Economy rules now live
- COAL_ORE mines -> COAL item; DIAMOND_ORE -> DIAMOND item; IRON_ORE/GOLD_ORE still drop the ore BLOCK (smelt them).
- ITEMS[id].heal is now honored by tryEat (golden apple full-heals).
- Sword damage: 116 stone=8, 117 iron=12 (mobs) — already wired in 35/52.
- Right-clicking a placed FURNACE opens the inventory screen (wired in 40).
## Canonical recipe list v2 (module 47)
CRAFT: 1 LOG->4 PLANK; 2 PLANK->4 STICK; 3 PLANK+2 STICK->WOOD_PICK; 3 COBBLE+2 STICK->STONE_PICK;
3 IRON_INGOT+2 STICK->IRON_PICK; 3 DIAMOND+2 STICK->DIAMOND_PICK; 3 PLANK+2 STICK->WOOD_AXE;
1 PLANK+2 STICK->WOOD_SHOVEL; 2 COBBLE+1 STICK->STONE_SWORD; 2 IRON_INGOT+1 STICK->IRON_SWORD;
8 COBBLE->FURNACE; 1 COAL+1 STICK->4 TORCH; 1 APPLE+4 GOLD_INGOT->GOLDEN_APPLE.
SMELT (requires a placed FURNACE within 4 blocks of the player; every smelt also consumes 1 COAL as fuel):
IRON_ORE->IRON_INGOT; GOLD_ORE->GOLD_INGOT; PORKCHOP->COOKED_PORKCHOP; BEEF->STEAK;
CHICKEN_MEAT->COOKED_CHICKEN; SAND->GLASS (block); COBBLE->STONE (block).


# ===================== V7 ADDENDUM (cycle 1: chests, armor, beds) =====================
## FIXED ids
Blocks: CHEST=32 (block-atlas tiles 36 side-with-latch, 37 top), BED=33 (shape:'slab', tile 38 red-blanket top w/ pillow, t:[38,38,38]).
Items (armor, item-atlas grows to 8x5=40 slots — grower must keep existing indices working):
IRON_HELM=130 IRON_CHEST=131 IRON_LEGS=132 IRON_BOOTS=133
GOLD_HELM=134 GOLD_CHEST=135 GOLD_LEGS=136 GOLD_BOOTS=137
DIA_HELM=138 DIA_CHEST=139 DIA_LEGS=140 DIA_BOOTS=141
Armor points (MC): helm 2/2/3, chest 6/5/8, legs 5/3/6, boots 2/1/3 for iron/gold/diamond. ITEMS[id].armor=points, ITEMS[id].slot='helm'|'chest'|'legs'|'boots'.
## Core hooks ALREADY WIRED (typeof-guarded)
- Right-click a placed CHEST -> openChest(x,y,z) [module 46]; a placed BED -> useBed(x,y,z) [module 43].
- damagePlayer applies n=armorReduce(n,cause) when defined [module 44]. Formula: reduction=min(0.6,0.04*totalPoints) — armor auto-equips (best owned piece per slot). Fall/void/starve/drown damage is NOT reduced (check cause string: only reduce when cause starts with 'Slain').
- Mesher supports shape:'slab' (half-height, for BED).
- DOM ready: #chestOv overlay (+#chestGrid,#chestPlayerGrid), #armorbar (render armor points as shield glyphs, hidden when 0/creative).
- Chest storage: localStorage 'voxelcraft_chests_v1' = {"x,y,z":{id:count,...}} — GUARD writes with mpIsGuest() like saveEdits. Breaking a chest: core does NOT handle contents — module 46 must expose chestOnBroken(x,y,z) and core... actually 46 should hook onBlockMined? NO: register contents transfer inside openChest module by listening? SIMPLEST CONTRACT: module 46 defines chestOnBlockMined(id,x,y,z) — NOT wired by core; instead 46 wraps: keep a mineFrame patch OUT. Core wires nothing extra: chest contents of a broken chest are moved to player inventory by 46 via a doBreak patch the INTEGRATOR (not you) adds. Agents: do not patch other files.
## Recipes (integrator adds to 47 after your work — just implement the systems)
8 PLANK->CHEST; 3 WOOL+3 PLANK->BED; armor: helm 5 / chest 8 / legs 7 / boots 4 units of (IRON_INGOT | GOLD_INGOT | DIAMOND).
## Beds
useBed(x,y,z): if !isNight() -> toast('You can only sleep at night'); else setTimeOfDay(0.28), set spawn to bed (SPAWNX=x+0.5,SPAWNZ=z+0.5,spawnY=y+1.2 — assignable globals), persist WMETA.sx/sz (guard mpIsGuest), toast('Slept. Spawn point set.'), blip soft.


# ===================== V8 ADDENDUM (drops, craft grid, crafting table) =====================
## FIXED ids: CRAFT_TABLE=34 (block-atlas tiles 39 top: plank grid pattern, 40 side: plank + tool marks).
## Drops are now ENTITIES: spawnDrop(x,y,z,id,n) exists (module 42). Mined blocks + mob drops pop out and
## magnet-collect. Modules should use spawnDrop (guarded) instead of direct invAdd for world drops.
## Module 47b (Forge) owns grid crafting: renderCraftGrid() (called by renderInventory), craftGridAdd(id)
## (wired to SHIFT+click in inventory), openCraftTable() (wired to right-clicking a CRAFT_TABLE block).
## Grid rules: 2x2 grid always available in E-screen; 3x3 only via crafting table. Placing an item into the
## grid invTakes it immediately; removing/closing returns it. Output slot shows the matched recipe; clicking
## output consumes the grid and invAdds the result. Shaped patterns (normalized bounding-box match) for:
## planks(L), sticks(P/P), torch(C over S), wood/stone/iron/diamond picks (MMM/.S./.S.), axes (MM/MS/.S),
## shovel (M/S/S), swords (M/M/S), furnace (8 cobble ring), chest (8 planks ring), crafting table (2x2 planks),
## bed (WWW/PPP), armor shapeless by count. Every LIST recipe stays available — the grid is additive fidelity.
