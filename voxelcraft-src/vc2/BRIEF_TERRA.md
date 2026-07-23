# BRIEF — Terra | World Smith
You own TWO files: /agent/workspace/vc2/12_blocks.js and /agent/workspace/vc2/32_terrain.js
Read /agent/workspace/vc2/HARNESS.md first. Read your two files and base_game.js for context.

## Mission
Biomes, ores, and ~14 new block types with atlas tiles. Make the world varied and beautiful.

## 12_blocks.js tasks
1. Grow the atlas: set ACOLS=8 and atlasC width/height = TS*8 = 256. Existing painters use tileXY()
   so they keep working. Existing tiles keep indices 0-13.
2. New tiles (indices 14+, your choice of numbering — keep a comment map):
   snow top, snowy grass side (dirt+white rim), snow block, ice (translucent blue-white, use clearRect+alpha),
   cactus side (green with darker vertical ribs), sandstone (pale banded), spruce leaves (darker blue-green),
   flower red (transparent bg + stem + red bloom), flower yellow, tall grass (transparent bg, thin green blades),
   coal ore (stone base + dark specks clusters), iron ore (stone + tan/cream specks), gold ore (stone + yellow),
   diamond ore (stone + cyan), torch (transparent bg, thin brown stick bottom 2/3, yellow-white flame tip).
   Transparent-background tiles MUST use ag.clearRect first so alpha survives.
3. Register the new blocks with the EXACT ids from the harness. Registry entry shape:
   BLOCKS[id]={n:'Name',t:[top,bottom,side], ...flags}
   Flags: opaque:false for GLASS/WATER/ICE + all cross/torch blocks; solid:false for WATER, FLOWER_R,
   FLOWER_Y, TALLGRASS, TORCH; trans:true for WATER/GLASS/ICE (renders in transparent mesh);
   shape:'cross' for flowers/tallgrass; shape:'torch' for TORCH.
   Patch existing defs: add opaque:false,solid:false,trans:true to WATER; opaque:false,trans:true to GLASS.
4. REPLACE isOpaque/isSolid with registry-driven versions:
   function isOpaque(id){var B=BLOCKS[id];return !!B&&B.opaque!==false;}
   function isSolid(id){var B=BLOCKS[id];return !!B&&B.solid!==false;}
5. Replace `var HOTBAR=[...]` with:
   var HOTBAR_SETS=[[GRASS,DIRT,STONE,SAND,LOG,LEAF,PLANK,GLASS,BRICK],
                    [COBBLE,SANDSTONE,SNOWBLK,CACTUS,TORCH,COAL_ORE,IRON_ORE,GOLD_ORE,DIAMOND_ORE]];
   var HOTBAR=HOTBAR_SETS[0];
6. Extend PCOL with sensible particle colors for every new block.

## 32_terrain.js tasks
1. Add biomeAt(wx,wz): temperature=fbm2(wx*0.0035+500,wz*0.0035+500,2), moisture=fbm2(wx*0.003-800,wz*0.003-800,2).
   temp<0.34 -> 'snow'; temp>0.66 && moisture<0.45 -> 'desert'; moisture>0.55 -> 'forest'; else 'plains'.
2. genChunk changes (keep its signature + edits-apply + neighbor-dirty code intact):
   - Surface by biome: desert -> SAND top with SANDSTONE (not dirt) below; snow -> SNOWGRASS top
     (grass block with snow top tile), water in snow biome frozen: replace WATER surface layer (y===SEA) with ICE;
     plains/forest -> GRASS as now. Mountains: if surface h>=44, top block SNOWBLK regardless of biome.
   - Beaches stay sand (h<=SEA+1) everywhere except snow biome (keep sand under ice edges fine).
   - Ores: replace some STONE during column fill using h3 cluster seeds — approx rates per stone block:
     COAL_ORE if h3(wx,y*7,wz)<0.022 and y<44; IRON_ORE if h3(wx+900,y*7,wz)<0.014 and y<30;
     GOLD_ORE if h3(wx-900,y*7,wz)<0.007 and y<18; DIAMOND_ORE if h3(wx,y*7,wz+900)<0.0045 and y<12.
     (Tune so caves reveal ores; order the checks so rarer wins.)
   - Trees by biome: forest density ~3x plains; snow biome -> spruce (taller trunk 5-7, SPRUCELEAF in
     narrower cone shape); desert -> NO trees, instead CACTUS columns (1-3 tall) on sand at ~0.004 rate,
     only where local x,z in [2,13].
   - Decorations on grass (plains/forest, after trees, only if block above surface is AIR):
     TALLGRASS at ~0.045 rate, FLOWER_R at ~0.008, FLOWER_Y at ~0.008 (use h2 with distinct salts).
   - When applying saved edits at the end (existing loop), ALSO: if the edit id===TORCH, do
     TORCHES.add((cx*16+lx)+','+y+','+(cz*16+lz)) using the loop's local coords. TORCHES is a global Set.
3. Keep performance sane: no per-block fbm2 beyond what's specified (biomeAt once per COLUMN, not per block).

## Acceptance
- Both files pass node --check; full build check passes.
- No edits outside your two files. Return the JSON per harness.
