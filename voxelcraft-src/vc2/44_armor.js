// MODULE 44: armor system — armorPoints, armorReduce, armor bar HUD (OWNER: Aegis)
// Top-level: declarations and plain data only. No DOM side effects at init time.

var _armorPtsCache = 0;
var _armorPtsCacheT = -9999;
var _lastArmorBarHTML = null;
var _armorBarEl = null;

// ===== armorPoints =====
// Scan inventory for the best-owned piece (highest .armor) for each slot.
// Uses typeof invCount guard. Caches result for 0.5s.
function armorPoints(){
 var now = (typeof performance !== 'undefined') ? performance.now() * 0.001 : 0;
 if(now - _armorPtsCacheT < 0.5) return _armorPtsCache;
 _armorPtsCacheT = now;

 if(typeof invCount !== 'function' || typeof ITEMS === 'undefined'){
  _armorPtsCache = 0;
  return 0;
 }

 var slots = ['helm','chest','legs','boots'];
 var best = {helm:0, chest:0, legs:0, boots:0};
 var id;
 for(id = 130; id <= 141; id++){
  var it = ITEMS[id];
  if(!it || !it.slot) continue;
  if(invCount(id) > 0){
   var pts = it.armor || 0;
   if(pts > best[it.slot]) best[it.slot] = pts;
  }
 }

 var total = 0;
 for(var si = 0; si < slots.length; si++) total += best[slots[si]];
 _armorPtsCache = total;
 return total;
}

// ===== armorReduce =====
// Only reduces damage whose cause starts with 'Slain' (combat).
// Fall, void, starve, drown causes are NOT reduced.
// Formula: reduction = min(0.6, 0.04 * totalPoints)
// Returns Math.max(1, round(n * (1 - reduction))).
function armorReduce(n, cause){
 if(typeof gamemode === 'undefined' || gamemode !== 'survival') return n;
 if(typeof cause !== 'string' || cause.indexOf('Slain') !== 0) return n;
 var pts = armorPoints();
 if(pts <= 0) return n;
 var reduction = Math.min(0.6, 0.04 * pts);
 return Math.max(1, Math.round(n * (1 - reduction)));
}

// ===== Armor Bar HUD =====

function _armorBarEl2(){
 if(!_armorBarEl) _armorBarEl = document.getElementById('armorbar');
 return _armorBarEl;
}

// Render shield glyphs: filled up to Math.ceil(pts/2), dim the rest, up to 10 total.
// Only visible in survival when pts > 0. Only touches DOM when HTML changes.
function armorBarTick(){
 var el = _armorBarEl2();
 if(!el) return;

 if(typeof gamemode === 'undefined' || gamemode !== 'survival'){
  if(el.style.display !== 'none'){
   el.style.display = 'none';
   _lastArmorBarHTML = null;
  }
  return;
 }

 var pts = armorPoints();

 if(pts <= 0){
  if(el.style.display !== 'none'){
   el.style.display = 'none';
   _lastArmorBarHTML = null;
  }
  return;
 }

 // show the bar
 if(el.style.display === 'none') el.style.display = '';

 var filled = Math.min(10, Math.ceil(pts / 2));
 var html = '';
 var i;
 for(i = 0; i < 10; i++){
  if(i < filled){
   html += '<span style="color:#cfd6e4">⛨</span>';
  } else {
   html += '<span style="color:#3a3d45;opacity:0.5">⛨</span>';
  }
 }

 if(html !== _lastArmorBarHTML){
  el.innerHTML = html;
  _lastArmorBarHTML = html;
 }
}

// ===== updateArmor / initArmor (entry points for the integrator) =====
// initArmor: no-op placeholder; integrator may call this at startup.
function initArmor(){
 // no-op — armor requires no setup beyond DOM elements already in 00_head.html
}

// updateArmor(dt): called each frame by the integrator to tick the armor bar.
function updateArmor(dt){
 // invalidate cache on each tick so armorPoints re-evaluates after 0.5s
 armorBarTick();
}
