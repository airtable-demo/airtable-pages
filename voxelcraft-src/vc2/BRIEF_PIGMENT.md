# BRIEF — Pigment | Icon Painter
You own ONE new file: /agent/workspace/vc2/14_items.js (create it).
Read /agent/workspace/vc2/HARNESS.md (incl. V3 ADDENDUM) first. Look at 12_blocks.js atlas painter style.

## Mission
Item registry + pixel-art item icons on a dedicated item atlas canvas.

## Tasks
1. var itemAtlasC = document.createElement('canvas'), 4x4 grid of 32px tiles (128x128), 2d context.
2. Paint pixel-art tiles (chunky 2-4px rects, transparent backgrounds via clearRect, readable at 32px):
   tile0 STICK (diagonal brown stick), tile1 PORKCHOP (meat: pink/brown lobe + bone-white end),
   tile2 APPLE (red round + tiny green leaf + stem), tile3-6 PICKAXES (same silhouette: diagonal handle +
   curved head; head color per tier: wood #8a6a3d, stone #9a9a9a, iron #d8d8d8, diamond #4fd8d2),
   tile7 AXE (handle + single-side blade), tile8 SHOVEL (handle + rounded scoop), tile9 SWORD (diagonal blade
   light-gray + brown hilt + guard). Leave rest empty.
3. Registry with EXACT harness ids:
   var ITEMS={};
   ITEMS[100]={n:'Stick',icon:0}; ITEMS[101]={n:'Porkchop',icon:1,food:8}; ITEMS[102]={n:'Apple',icon:2,food:4};
   ITEMS[110]={n:'Wooden Pickaxe',icon:3,tool:'pick',tier:1}; ITEMS[111]={n:'Stone Pickaxe',icon:4,tool:'pick',tier:2};
   ITEMS[112]={n:'Iron Pickaxe',icon:5,tool:'pick',tier:3}; ITEMS[113]={n:'Diamond Pickaxe',icon:6,tool:'pick',tier:4};
   ITEMS[114]={n:'Wooden Axe',icon:7,tool:'axe',tier:1}; ITEMS[115]={n:'Wooden Shovel',icon:8,tool:'shovel',tier:1};
   ITEMS[116]={n:'Stone Sword',icon:9,tool:'sword',tier:2};
4. function isBlockId(id){return typeof id==='number'&&id>0&&id<100;}
5. function drawItemIcon(g2,id,dx,dy,size){var it=ITEMS[id];if(!it)return;var c=it.icon%4,r=Math.floor(it.icon/4);
   g2.imageSmoothingEnabled=false;g2.drawImage(itemAtlasC,c*32,r*32,32,32,dx,dy,size,size);}
Top-level side effects allowed ONLY for creating+painting itemAtlasC (mirrors 12_blocks.js pattern).

## Checks + return
node --check /agent/workspace/vc2/14_items.js AND python3 /agent/workspace/vc2/build_vc.py --check-only.
Only edit your file. Return JSON {files,features,check,notes}.
