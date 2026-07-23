// MODULE 47b: grid crafting + crafting table (OWNER: Forge)
// Concat order: runs right after 47_inventory.js; all core APIs and BLOCKS/PCOL/ag/tileXY available.

// ===== BLOCK REGISTRATION & ATLAS PAINTING =====

var CRAFT_TABLE = 34;
BLOCKS[CRAFT_TABLE] = {n:'Crafting Table', t:[39,39,40]};
PCOL[CRAFT_TABLE] = 0xa87c3c;

(function(){
 // tile 39: plank top with 2x2 darker grid lines (crafting surface)
 var p = tileXY(39);
 ag.fillStyle = '#a8824e'; ag.fillRect(p[0], p[1], TS, TS);
 // plank grain lines horizontal
 ag.fillStyle = '#8d6b3d';
 for (var y = 7; y < TS; y += 8) ag.fillRect(p[0], p[1]+y, TS, 2);
 // plank grain vertical seam
 ag.fillStyle = '#96733f';
 for (var i = 0; i < 10; i++) {
  ag.fillRect(p[0]+Math.floor(arand()*TS), p[1]+Math.floor(arand()*TS), 3, 1);
 }
 // 2x2 grid lines in darker brown
 ag.fillStyle = '#5c3d1a';
 ag.fillRect(p[0]+15, p[1]+1,  2, TS-2); // vertical divider
 ag.fillRect(p[0]+1,  p[1]+15, TS-2, 2); // horizontal divider
 // subtle grid cell shading
 ag.fillStyle = 'rgba(0,0,0,0.12)';
 ag.fillRect(p[0]+1,  p[1]+1,  14, 14);
 ag.fillRect(p[0]+17, p[1]+17, 14, 14);

 // tile 40: plank side with saw/tool marks
 p = tileXY(40);
 ag.fillStyle = '#a8824e'; ag.fillRect(p[0], p[1], TS, TS);
 // plank grain horizontal
 ag.fillStyle = '#8d6b3d';
 for (var y2 = 7; y2 < TS; y2 += 8) ag.fillRect(p[0], p[1]+y2, TS, 2);
 // saw-cut marks (diagonal dash lines suggesting tool work)
 ag.fillStyle = '#5c3d1a';
 ag.fillRect(p[0]+4,  p[1]+4,  6, 1);
 ag.fillRect(p[0]+6,  p[1]+6,  6, 1);
 ag.fillRect(p[0]+8,  p[1]+8,  6, 1);
 ag.fillRect(p[0]+18, p[1]+5,  6, 1);
 ag.fillRect(p[0]+20, p[1]+7,  6, 1);
 ag.fillRect(p[0]+22, p[1]+9,  6, 1);
 // darker top edge (surface)
 ag.fillStyle = '#7a5c2c';
 ag.fillRect(p[0], p[1], TS, 3);

 if (typeof atlas !== 'undefined') atlas.needsUpdate = true;
})();

// ===== GRID CRAFTING STATE =====

var gridSize = 2;          // 2 = 2x2 mode, 3 = 3x3 mode
var gridCells = [null,null,null,null,null,null,null,null,null]; // always 3x3 flat, index r*3+c
var craftTableFlag = false; // set by openCraftTable, cleared after use

// ===== ITEM ID REFERENCES (fallbacks to fixed numbers from HARNESS) =====
var CG_STICK    = (typeof STICK         !== 'undefined') ? STICK         : 100;
var CG_PLANK    = (typeof PLANK         !== 'undefined') ? PLANK         : 7;
var CG_LOG      = (typeof LOG           !== 'undefined') ? LOG           : 5;
var CG_COBBLE   = (typeof COBBLE        !== 'undefined') ? COBBLE        : 10;
var CG_IRON_I   = (typeof IRON_INGOT    !== 'undefined') ? IRON_INGOT    : 105;
var CG_DIAMOND  = (typeof DIAMOND       !== 'undefined') ? DIAMOND       : 107;
var CG_COAL     = (typeof COAL          !== 'undefined') ? COAL          : 108;
var CG_GOLD_I   = (typeof GOLD_INGOT    !== 'undefined') ? GOLD_INGOT    : 106;
var CG_APPLE    = (typeof APPLE         !== 'undefined') ? APPLE         : 102;
var CG_WOOL     = 27;
var CG_TORCH    = 26;
var CG_FURNACE  = 31;
var CG_CHEST    = 32;
var CG_BED      = 33;
var CG_CT       = 34;  // crafting table itself
var CG_WOOD_PICK   = (typeof WOOD_PICK    !== 'undefined') ? WOOD_PICK    : 110;
var CG_STONE_PICK  = (typeof STONE_PICK   !== 'undefined') ? STONE_PICK   : 111;
var CG_IRON_PICK   = (typeof IRON_PICK    !== 'undefined') ? IRON_PICK    : 112;
var CG_DIA_PICK    = (typeof DIAMOND_PICK !== 'undefined') ? DIAMOND_PICK : 113;
var CG_WOOD_AXE    = (typeof WOOD_AXE     !== 'undefined') ? WOOD_AXE     : 114;
var CG_WOOD_SHOVEL = (typeof WOOD_SHOVEL  !== 'undefined') ? WOOD_SHOVEL  : 115;
var CG_STONE_SWORD = (typeof STONE_SWORD  !== 'undefined') ? STONE_SWORD  : 116;
var CG_IRON_SWORD  = (typeof IRON_SWORD   !== 'undefined') ? IRON_SWORD   : 117;
var CG_IRON_HELM   = 130;
var CG_IRON_CHEST  = 131;
var CG_IRON_LEGS   = 132;
var CG_IRON_BOOTS  = 133;
var CG_GOLD_HELM   = 134;
var CG_GOLD_CHEST  = 135;
var CG_GOLD_LEGS   = 136;
var CG_GOLD_BOOTS  = 137;
var CG_DIA_HELM    = 138;
var CG_DIA_CHEST   = 139;
var CG_DIA_LEGS    = 140;
var CG_DIA_BOOTS   = 141;
var CG_GOLDEN_APPLE = 123;

// ===== SHAPED RECIPES =====
// Pattern arrays are row-major strings for a bounding-box normalization.
// Letters map to item ids at match time.

function cgGetShapedRecipes() {
 // Each recipe: { pattern: [string,...], map: {letter:id}, out:id, outN:n }
 // Pattern is an array of strings, one per row. Uses smallest bounding box.
 var P = CG_PLANK, S = CG_STICK, C = CG_COBBLE, I = CG_IRON_I, D = CG_DIAMOND;
 var L = CG_LOG, O = CG_COAL, W = CG_WOOL, G = CG_GOLD_I, A = CG_APPLE;
 var F = 31; // furnace block id
 return [
  // 1 LOG -> 4 PLANK (1x1 shapeless-style but we put it in shaped too)
  // handled in shapeless; skip here to avoid duplicate

  // 2 PLANK -> 4 STICK (2x1)
  {pat:['X','X'], map:{X:P}, out:CG_STICK, outN:4},

  // torch: coal over stick (2x1 vertical)
  {pat:['C','S'], map:{C:CG_COAL, S:CG_STICK}, out:CG_TORCH, outN:4},

  // picks (3x2: MMM / .S. / .S.)
  {pat:['MMM','.S.','.S.'], map:{M:P, S:S}, out:CG_WOOD_PICK,  outN:1},
  {pat:['MMM','.S.','.S.'], map:{M:C, S:S}, out:CG_STONE_PICK, outN:1},
  {pat:['MMM','.S.','.S.'], map:{M:I, S:S}, out:CG_IRON_PICK,  outN:1},
  {pat:['MMM','.S.','.S.'], map:{M:D, S:S}, out:CG_DIA_PICK,   outN:1},

  // wooden axe (2x3: MM / MS / .S)
  {pat:['MM','MS','.S'], map:{M:P, S:S}, out:CG_WOOD_AXE, outN:1},

  // wooden shovel (1x3: M / S / S)
  {pat:['M','S','S'], map:{M:P, S:S}, out:CG_WOOD_SHOVEL, outN:1},

  // swords (1x3: M / M / S)
  {pat:['M','M','S'], map:{M:C, S:S}, out:CG_STONE_SWORD, outN:1},
  {pat:['M','M','S'], map:{M:I, S:S}, out:CG_IRON_SWORD,  outN:1},

  // furnace: 8 cobble ring (3x3 hollow)
  {pat:['CCC','C.C','CCC'], map:{C:C}, out:CG_FURNACE, outN:1},

  // chest: 8 planks ring (3x3 hollow)
  {pat:['PPP','P.P','PPP'], map:{P:P}, out:CG_CHEST, outN:1},

  // crafting table: 2x2 planks
  {pat:['PP','PP'], map:{P:P}, out:CG_CT, outN:1},

  // bed: WWW / PPP
  {pat:['WWW','PPP'], map:{W:W, P:P}, out:CG_BED, outN:1},

  // golden apple: apple center + 4 gold ingot corners (3x3)
  {pat:['.G.','GAG','.G.'], map:{G:G, A:CG_APPLE}, out:CG_GOLDEN_APPLE, outN:1},

  // armor — shaped patterns
  // iron helm: 5 iron (U shape: XX / X.X)
  {pat:['XX','X.X'], map:{X:I}, out:CG_IRON_HELM,  outN:1},
  {pat:['XX','X.X'], map:{X:CG_GOLD_I}, out:CG_GOLD_HELM, outN:1},
  {pat:['XX','X.X'], map:{X:D}, out:CG_DIA_HELM,   outN:1},
  // chestplate: 8 pieces (X.X / XXX / XXX)
  {pat:['X.X','XXX','XXX'], map:{X:I}, out:CG_IRON_CHEST,  outN:1},
  {pat:['X.X','XXX','XXX'], map:{X:CG_GOLD_I}, out:CG_GOLD_CHEST, outN:1},
  {pat:['X.X','XXX','XXX'], map:{X:D}, out:CG_DIA_CHEST,   outN:1},
  // leggings: 7 pieces (XXX / X.X / X.X)
  {pat:['XXX','X.X','X.X'], map:{X:I}, out:CG_IRON_LEGS,  outN:1},
  {pat:['XXX','X.X','X.X'], map:{X:CG_GOLD_I}, out:CG_GOLD_LEGS, outN:1},
  {pat:['XXX','X.X','X.X'], map:{X:D}, out:CG_DIA_LEGS,   outN:1},
  // boots: 4 pieces (X.X / X.X)
  {pat:['X.X','X.X'], map:{X:I}, out:CG_IRON_BOOTS,  outN:1},
  {pat:['X.X','X.X'], map:{X:CG_GOLD_I}, out:CG_GOLD_BOOTS, outN:1},
  {pat:['X.X','X.X'], map:{X:D}, out:CG_DIA_BOOTS,   outN:1}
 ];
}

// ===== SHAPELESS RECIPES =====
function cgGetShapelessRecipes() {
 return [
  {ing:[{id:CG_LOG,n:1}],    out:CG_PLANK,    outN:4},
  {ing:[{id:CG_PLANK,n:2}],  out:CG_STICK,    outN:4},
  // armor shapeless by count
  {ing:[{id:CG_IRON_I,n:5}],  out:CG_IRON_HELM,  outN:1},
  {ing:[{id:CG_IRON_I,n:8}],  out:CG_IRON_CHEST, outN:1},
  {ing:[{id:CG_IRON_I,n:7}],  out:CG_IRON_LEGS,  outN:1},
  {ing:[{id:CG_IRON_I,n:4}],  out:CG_IRON_BOOTS, outN:1},
  {ing:[{id:CG_GOLD_I,n:5}],  out:CG_GOLD_HELM,  outN:1},
  {ing:[{id:CG_GOLD_I,n:8}],  out:CG_GOLD_CHEST, outN:1},
  {ing:[{id:CG_GOLD_I,n:7}],  out:CG_GOLD_LEGS,  outN:1},
  {ing:[{id:CG_GOLD_I,n:4}],  out:CG_GOLD_BOOTS, outN:1},
  {ing:[{id:CG_DIAMOND,n:5}], out:CG_DIA_HELM,   outN:1},
  {ing:[{id:CG_DIAMOND,n:8}], out:CG_DIA_CHEST,  outN:1},
  {ing:[{id:CG_DIAMOND,n:7}], out:CG_DIA_LEGS,   outN:1},
  {ing:[{id:CG_DIAMOND,n:4}], out:CG_DIA_BOOTS,  outN:1}
 ];
}

// ===== PATTERN MATCHING =====

// Return a 2D array (array of arrays) of ids/null for the bounding box of occupied cells
// within the active gridSize region. Returns null if grid is empty.
function cgNormalize() {
 var size = gridSize;
 var minR = size, maxR = -1, minC = size, maxC = -1;
 for (var r = 0; r < size; r++) {
  for (var c = 0; c < size; c++) {
   if (gridCells[r*3+c] !== null) {
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
   }
  }
 }
 if (maxR < 0) return null; // empty
 var rows = [];
 for (var rr = minR; rr <= maxR; rr++) {
  var row = [];
  for (var cc = minC; cc <= maxC; cc++) {
   row.push(gridCells[rr*3+cc]); // null or id (number)
  }
  rows.push(row);
 }
 return rows; // array of arrays
}

// Check if a shaped recipe matches the current grid
// Recipe pat rows use single letters; map translates letter -> id
function cgMatchShaped(recipe) {
 var pat = recipe.pat;
 var map = recipe.map;
 // Build reference as 2D array of ids / null
 var refRows = [];
 for (var ri = 0; ri < pat.length; ri++) {
  var row = [];
  for (var ci = 0; ci < pat[ri].length; ci++) {
   var ch = pat[ri][ci];
   if (ch === '.') {
    row.push(null);
   } else {
    var mid = map[ch];
    if (mid === undefined || mid === null) return false;
    row.push(mid);
   }
  }
  refRows.push(row);
 }
 // Compare normalized grid to reference
 var norm = cgNormalize();
 if (!norm) return false;
 if (norm.length !== refRows.length) return false;
 for (var i = 0; i < norm.length; i++) {
  if (norm[i].length !== refRows[i].length) return false;
  for (var j = 0; j < norm[i].length; j++) {
   if (norm[i][j] !== refRows[i][j]) return false;
  }
 }
 return true;
}

// Check if a shapeless recipe matches (only cares about item counts, not positions)
function cgMatchShapeless(recipe) {
 // Count ids in current grid (within gridSize region)
 var counts = {};
 var size = gridSize;
 for (var r = 0; r < size; r++) {
  for (var c = 0; c < size; c++) {
   var v = gridCells[r*3+c];
   if (v !== null) counts[v] = (counts[v]||0) + 1;
  }
 }
 // Verify all ingredients match exactly (no leftover cells allowed)
 var totalRequired = 0;
 for (var i = 0; i < recipe.ing.length; i++) {
  var ing = recipe.ing[i];
  if ((counts[ing.id]||0) < ing.n) return false;
  totalRequired += ing.n;
 }
 // Count total occupied cells
 var totalUsed = 0;
 for (var k in counts) {
  if (counts.hasOwnProperty(k)) totalUsed += counts[k];
 }
 return totalUsed === totalRequired;
}

// Get output of current grid state; returns {out, outN} or null
function cgGetOutput() {
 // Try shaped first
 var shaped = cgGetShapedRecipes();
 for (var i = 0; i < shaped.length; i++) {
  if (cgMatchShaped(shaped[i])) {
   return {out: shaped[i].out, outN: shaped[i].outN};
  }
 }
 // Try shapeless
 var shapeless = cgGetShapelessRecipes();
 for (var j = 0; j < shapeless.length; j++) {
  if (cgMatchShapeless(shapeless[j])) {
   return {out: shapeless[j].out, outN: shapeless[j].outN};
  }
 }
 return null;
}

// ===== SMALL ICON CANVAS HELPER =====
function cgMakeIcon(id) {
 var cc = document.createElement('canvas');
 var sz = (typeof TS !== 'undefined') ? TS : 32;
 cc.width = cc.height = sz;
 var g2 = cc.getContext('2d');
 g2.imageSmoothingEnabled = false;
 if (typeof drawSlotIcon === 'function') drawSlotIcon(g2, id);
 return cc;
}

// ===== craftGridReturnAll: refund all grid cells to inventory =====
function craftGridReturnAll() {
 for (var i = 0; i < 9; i++) {
  if (gridCells[i] !== null) {
   if (typeof invAdd === 'function') invAdd(gridCells[i], 1);
   gridCells[i] = null;
  }
 }
}

// ===== craftGridReset: called from renderCraftGrid when NOT opened via openCraftTable =====
function craftGridReset() {
 if (!craftTableFlag) {
  // If we were in 3x3 mode but not via openCraftTable, return items and reset
  if (gridSize === 3) {
   craftGridReturnAll();
   gridSize = 2;
  }
 }
 craftTableFlag = false; // consume the flag
}

// ===== craftGridAdd: called on SHIFT+click in inventory =====
function craftGridAdd(id) {
 if (typeof invTake !== 'function') return;
 var size = gridSize;
 // Find first empty cell within the active region
 for (var r = 0; r < size; r++) {
  for (var c = 0; c < size; c++) {
   var idx = r*3+c;
   if (gridCells[idx] === null) {
    if (invTake(id, 1)) {
     gridCells[idx] = id;
     if (typeof renderInventory === 'function') renderInventory();
    }
    return;
   }
  }
 }
 // Grid full
 if (typeof toast === 'function') toast('Craft grid full');
}

// ===== renderCraftGrid: called from renderInventory =====
function renderCraftGrid() {
 // Reset/flag handling: if this is a normal inventory open (not via openCraftTable),
 // and we somehow ended up in 3x3 mode, reset back to 2x2.
 craftGridReset();

 var wrap = document.getElementById('craftGridWrap');
 if (!wrap) return;
 wrap.innerHTML = '';

 var size = gridSize;
 var result = cgGetOutput();

 // ----- header -----
 var hdr = document.createElement('div');
 hdr.style.cssText = 'font-size:10px;letter-spacing:2px;color:#9fb2dd;margin-bottom:8px;font-family:monospace;text-transform:uppercase;';
 hdr.textContent = (size === 3) ? 'CRAFTING TABLE 3x3' : 'CRAFT GRID 2x2';
 wrap.appendChild(hdr);

 // ----- grid cells -----
 var gridDiv = document.createElement('div');
 gridDiv.style.cssText = 'display:grid;grid-template-columns:repeat('+size+',48px);gap:4px;margin-bottom:8px;';
 wrap.appendChild(gridDiv);

 for (var r = 0; r < size; r++) {
  for (var c = 0; c < size; c++) {
   (function(row, col) {
    var idx = row*3+col;
    var id = gridCells[idx];
    var cell = document.createElement('div');
    cell.className = 'icell';
    cell.title = (id !== null && typeof slotName === 'function') ? slotName(id) : '';
    if (id !== null) {
     cell.appendChild(cgMakeIcon(id));
    } else {
     // empty cell with dim background
     cell.style.opacity = '0.45';
    }
    cell.addEventListener('click', function() {
     if (gridCells[idx] !== null) {
      // Return item to inventory
      if (typeof invAdd === 'function') invAdd(gridCells[idx], 1);
      gridCells[idx] = null;
      if (typeof renderInventory === 'function') renderInventory();
     }
    });
    gridDiv.appendChild(cell);
   })(r, c);
  }
 }

 // ----- arrow -----
 var arrow = document.createElement('div');
 arrow.style.cssText = 'color:#9fb2dd;font-size:18px;margin:4px 0;text-align:center;';
 arrow.textContent = '▶';
 wrap.appendChild(arrow);

 // ----- output slot -----
 var outCell = document.createElement('div');
 outCell.className = 'icell';
 if (result) {
  outCell.appendChild(cgMakeIcon(result.out));
  if (result.outN > 1) {
   var cnt = document.createElement('div');
   cnt.className = 'icnt';
   cnt.textContent = result.outN;
   outCell.appendChild(cnt);
  }
  outCell.title = (typeof slotName === 'function') ? slotName(result.out) : '';
  outCell.addEventListener('click', (function(res) {
   return function() {
    // Consume all grid cells (already invTaken) — just clear without refund
    for (var i = 0; i < 9; i++) gridCells[i] = null;
    if (typeof invAdd === 'function') invAdd(res.out, res.outN);
    if (typeof blip === 'function') blip(600, 400, 0.08, 0.08);
    if (typeof renderInventory === 'function') renderInventory();
   };
  })(result));
 } else {
  outCell.style.opacity = '0.25';
  outCell.title = '';
 }
 wrap.appendChild(outCell);
}

// ===== openCraftTable: called when player right-clicks a placed CRAFT_TABLE block =====
function openCraftTable() {
 // Refund any existing 2x2 items before switching to 3x3 (size change could orphan cells)
 // Only refund if we're switching from 2x2 to 3x3
 if (gridSize === 2) {
  craftGridReturnAll();
 }
 gridSize = 3;
 craftTableFlag = true;
 if (typeof openInventory === 'function') openInventory();
}
