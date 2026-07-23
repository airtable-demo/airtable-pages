// MODULE 46: Chests — block definition, storage, open/close UI, loot-on-break (OWNER: Casket)
// Concat order: ...45,47,46 (wait — actually: ...45,47_inventory,46_chests,48,49,50)
// Top-level: declarations + data + atlas painting + storage load + ONE keydown listener.

// ---- block id constant ----
var CHEST = 32;
BLOCKS[CHEST] = {n:'Chest', t:[37,37,36]};
PCOL[CHEST] = 0xa8834f;

// ---- paint chest atlas tiles (pattern from 52_end.js) ----
(function(){
 // tile 36: chest side — wood-plank base + dark frame border + horizontal lid seam + dark square latch
 var p = tileXY(36);
 // plank base: same warm brown as planks
 ag.fillStyle = '#a8824e'; ag.fillRect(p[0], p[1], TS, TS);
 // horizontal plank lines
 ag.fillStyle = '#8d6b3d';
 for (var y = 7; y < TS; y += 8) ag.fillRect(p[0], p[1]+y, TS, 2);
 // dark frame border (4px thick all around)
 ag.fillStyle = '#5c4222';
 ag.fillRect(p[0],      p[1],      TS, 4);  // top
 ag.fillRect(p[0],      p[1]+TS-4, TS, 4);  // bottom
 ag.fillRect(p[0],      p[1],      4, TS);  // left
 ag.fillRect(p[0]+TS-4, p[1],      4, TS);  // right
 // horizontal lid seam at y=14 (roughly 44% down) — 2px dark line
 ag.fillStyle = '#3d2a12';
 ag.fillRect(p[0]+4, p[1]+14, TS-8, 2);
 // darker square latch at center (5x7 px, centered)
 var lx = p[0] + Math.floor(TS/2) - 2;
 var ly = p[1] + 11;
 ag.fillStyle = '#2e1e08'; ag.fillRect(lx, ly, 6, 8);
 ag.fillStyle = '#7a5c2e'; ag.fillRect(lx+1, ly+1, 4, 6);
 ag.fillStyle = '#3d2a12'; ag.fillRect(lx+2, ly+3, 2, 2);
 if (typeof atlas !== 'undefined') atlas.needsUpdate = true;
})();

(function(){
 // tile 37: chest top — plank top with frame border
 var p = tileXY(37);
 ag.fillStyle = '#a8824e'; ag.fillRect(p[0], p[1], TS, TS);
 ag.fillStyle = '#8d6b3d';
 for (var y = 7; y < TS; y += 8) ag.fillRect(p[0], p[1]+y, TS, 2);
 // cross plank seam for top
 ag.fillStyle = '#96733f';
 ag.fillRect(p[0] + Math.floor(TS/2)-1, p[1]+4, 2, TS-8);
 // dark frame border
 ag.fillStyle = '#5c4222';
 ag.fillRect(p[0],      p[1],      TS, 4);
 ag.fillRect(p[0],      p[1]+TS-4, TS, 4);
 ag.fillRect(p[0],      p[1],      4, TS);
 ag.fillRect(p[0]+TS-4, p[1],      4, TS);
 if (typeof atlas !== 'undefined') atlas.needsUpdate = true;
})();

// ---- chest storage ----
var CHEST_KEY = 'voxelcraft_chests_v1';
var chestStore = {};   // { "x,y,z": { id: count, ... } }
var chestSaveT = null;
var chestOpenKey = null;  // currently-open chest "x,y,z" string

function chestPersist() {
 if (chestSaveT) clearTimeout(chestSaveT);
 chestSaveT = setTimeout(function() {
  chestSaveT = null;
  if (typeof mpIsGuest === 'function' && mpIsGuest()) return;
  try { localStorage.setItem(CHEST_KEY, JSON.stringify(chestStore)); } catch(e) {}
 }, 500);
}

(function chestLoad() {
 try {
  var raw = localStorage.getItem(CHEST_KEY);
  if (!raw) return;
  var data = JSON.parse(raw);
  if (!data || typeof data !== 'object') return;
  var s = {};
  for (var k in data) {
   if (!data.hasOwnProperty(k)) continue;
   var chest = data[k];
   if (!chest || typeof chest !== 'object') continue;
   var contents = {};
   for (var id in chest) {
    if (!chest.hasOwnProperty(id)) continue;
    var n = chest[id];
    if (typeof n === 'number' && n > 0) contents[id] = Math.floor(n);
   }
   s[k] = contents;
  }
  chestStore = s;
 } catch(e) { chestStore = {}; }
})();

// ---- helper: make an icon cell (mirrors 47_inventory.js pattern) ----
function chestMakeCell(id, count, clickFn) {
 var cell = document.createElement('div');
 cell.className = 'icell';
 cell.title = (typeof slotName === 'function') ? slotName(id) : '';
 var cc = document.createElement('canvas');
 cc.width = cc.height = (typeof TS !== 'undefined') ? TS : 32;
 var g2 = cc.getContext('2d'); g2.imageSmoothingEnabled = false;
 if (typeof drawSlotIcon === 'function') drawSlotIcon(g2, id);
 cell.appendChild(cc);
 if (count > 1) {
  var cntEl = document.createElement('div'); cntEl.className = 'icnt';
  cntEl.textContent = count; cell.appendChild(cntEl);
 }
 cell.addEventListener('click', clickFn);
 return cell;
}

// ---- render chest overlay contents ----
function renderChest() {
 var chestGrid = document.getElementById('chestGrid');
 var playerGrid = document.getElementById('chestPlayerGrid');
 if (!chestGrid || !playerGrid) return;
 chestGrid.innerHTML = '';
 playerGrid.innerHTML = '';

 var key = chestOpenKey;
 var contents = (key && chestStore[key]) ? chestStore[key] : {};

 // chest side — filled slots then empty padded to 27
 var ids = [];
 for (var id in contents) {
  if (contents.hasOwnProperty(id) && contents[id] > 0) ids.push(Number(id));
 }
 for (var i = 0; i < ids.length; i++) {
  (function(itemId) {
   var cnt = contents[itemId];
   if (!cnt || cnt <= 0) return;
   chestGrid.appendChild(chestMakeCell(itemId, cnt, function() {
    // move 1 from chest -> player inventory
    if (!chestOpenKey) return;
    var c = chestStore[chestOpenKey];
    if (!c || !c[itemId] || c[itemId] <= 0) return;
    c[itemId]--;
    if (c[itemId] <= 0) delete c[itemId];
    if (typeof invAdd === 'function') invAdd(itemId, 1);
    chestPersist();
    renderChest();
   }));
  })(ids[i]);
 }
 // pad empty slots to 27
 var filled = ids.length;
 for (var j = filled; j < 27; j++) {
  var empty = document.createElement('div');
  empty.className = 'icell';
  empty.style.opacity = '0.3';
  empty.style.cursor = 'default';
  chestGrid.appendChild(empty);
 }

 // player side — items in player inventory
 if (typeof invAll === 'function') {
  var inv = invAll();
  var pids = [];
  for (var pid in inv) {
   if (inv.hasOwnProperty(pid) && inv[pid] > 0) pids.push(Number(pid));
  }
  for (var pi = 0; pi < pids.length; pi++) {
   (function(pItemId) {
    var pcnt = inv[pItemId];
    if (!pcnt || pcnt <= 0) return;
    playerGrid.appendChild(chestMakeCell(pItemId, pcnt, function() {
     // move 1 from player -> chest
     if (!chestOpenKey) return;
     if (typeof invTake !== 'function' || !invTake(pItemId, 1)) return;
     if (!chestStore[chestOpenKey]) chestStore[chestOpenKey] = {};
     var c2 = chestStore[chestOpenKey];
     c2[pItemId] = (c2[pItemId] || 0) + 1;
     chestPersist();
     renderChest();
    }));
   })(pids[pi]);
  }
 }
}

// ---- close chest overlay ----
function closeChestOv() {
 var ov = document.getElementById('chestOv');
 if (ov) ov.style.display = 'none';
 chestOpenKey = null;
 // re-acquire pointer lock if we were in play-ish state
 if (typeof tryLock === 'function') tryLock();
}

// ---- keydown listener: close on E or Escape when overlay is visible ----
document.addEventListener('keydown', function(e) {
 var ov = document.getElementById('chestOv');
 if (!ov || ov.style.display === 'none') return;
 if (e.code === 'KeyE' || e.code === 'Escape') {
  closeChestOv();
  // state is 'inv' at this point; core's own keydown will also run and call
  // closeInventory() -> hides #inv (harmless, it's already hidden) + sets state='play'
  // So we do NOT stop propagation — let core finish state reset.
 }
}, false);

// ---- openChest(x,y,z) — called by core right-click handler ----
function openChest(x, y, z) {
 var key = x + ',' + y + ',' + z;
 if (!chestStore[key]) chestStore[key] = {};
 chestOpenKey = key;

 // set core state to 'inv' so E/ESC (via core closeInventory) resets state properly
 state = 'inv';

 // show the chest overlay
 var ov = document.getElementById('chestOv');
 if (ov) ov.style.display = 'flex';

 // hide the inventory overlay in case it was showing (it won't be, but defensive)
 var invOv = document.getElementById('inv');
 if (invOv) invOv.style.display = 'none';

 // release pointer lock gracefully
 if (typeof suppressNextUnlockPause === 'function') suppressNextUnlockPause();
 try { document.exitPointerLock(); } catch(e2) {}

 renderChest();
}

// ---- chestOnBroken(x,y,z) — called by core doBreak when a chest is mined ----
function chestOnBroken(x, y, z) {
 var key = x + ',' + y + ',' + z;
 var contents = chestStore[key];
 if (contents) {
  for (var id in contents) {
   if (!contents.hasOwnProperty(id)) continue;
   var n = contents[id];
   if (typeof n === 'number' && n > 0) {
    if (typeof invAdd === 'function') invAdd(Number(id), n);
   }
  }
  delete chestStore[key];
  chestPersist();
  if (typeof toast === 'function') toast('Chest contents recovered');
 }
 // if this chest was open, close the overlay
 if (chestOpenKey === key) {
  closeChestOv();
  state = 'play';
 }
}
