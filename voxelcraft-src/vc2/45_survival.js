// MODULE 45: survival systems — health, hunger, air, fall damage, tool-gated mining, drops (OWNER: Pulse2)
// ===== SURVIVAL STATE =====
// NOTE: top-level = declarations + plain data literals only. No DOM touches, no side effects here.
// v3: local inventory object + refreshCounts REMOVED — module 47 (Satchel) owns invAdd/invTake/invCount.
// All calls into that API are typeof-guarded below with graceful (no-op / best-effort) degradation.

var hp=20, air=10, hunger=20;
var lastDamageT=-999, regenAcc=0, drownAcc=0;
var dmgFlashEl=null, heartsEl=null, bubblesEl=null, mineprogEl=null, mineprogFEl=null, hungerEl=null;
var lastHeartsHTML=null, lastBubblesHTML=null, lastHungerHTML=null;
var mineProg=0, mineKey=null;
var starveAcc=0, prevVy=0;

// hardness table (seconds to mine, base — before tool speed/penalty scaling) — looked up by
// block id at call time so it tolerates new block ids being registered by other modules before this runs.
function survivalHardness(id){
 if(typeof LEAF!=='undefined'&&id===LEAF)return 0.05;
 if(typeof TALLGRASS!=='undefined'&&id===TALLGRASS)return 0.05;
 if(typeof FLOWER_R!=='undefined'&&id===FLOWER_R)return 0.05;
 if(typeof FLOWER_Y!=='undefined'&&id===FLOWER_Y)return 0.05;
 if(typeof TORCH!=='undefined'&&id===TORCH)return 0.05;
 if(id===GRASS||id===DIRT||id===SAND)return 0.45;
 if(typeof SNOWGRASS!=='undefined'&&id===SNOWGRASS)return 0.45;
 if(typeof SNOWBLK!=='undefined'&&id===SNOWBLK)return 0.45;
 if(id===LOG||id===PLANK)return 0.7;
 if(typeof CACTUS!=='undefined'&&id===CACTUS)return 0.7;
 if(id===GLASS)return 0.25;
 if(typeof ICE!=='undefined'&&id===ICE)return 0.25;
 if(typeof FURNACE!=='undefined'&&id===FURNACE)return 1.2;
 if(id===STONE||id===COBBLE||id===BRICK)return 1.1;
 if(typeof SANDSTONE!=='undefined'&&id===SANDSTONE)return 1.1;
 if(typeof COAL_ORE!=='undefined'&&id===COAL_ORE)return 1.3;
 if(typeof IRON_ORE!=='undefined'&&id===IRON_ORE)return 1.6;
 if(typeof GOLD_ORE!=='undefined'&&id===GOLD_ORE)return 1.4;
 if(typeof DIAMOND_ORE!=='undefined'&&id===DIAMOND_ORE)return 2.2;
 if(id===WATER)return Infinity;
 if(id===BEDROCK)return Infinity;
 return 0.6;
}

// drops table — what block id you receive when mining id (survival only, harvest-gated by canHarvest
// upstream in onBlockMined). returns the block id to grant, or null/undefined for no drop.
function survivalDrop(id){
 if(id===GRASS)return DIRT;
 if(id===STONE)return COBBLE;
 if(typeof SNOWGRASS!=='undefined'&&id===SNOWGRASS)return DIRT;
 if(typeof TALLGRASS!=='undefined'&&id===TALLGRASS)return null;
 if(typeof FLOWER_R!=='undefined'&&id===FLOWER_R)return FLOWER_R;
 if(typeof FLOWER_Y!=='undefined'&&id===FLOWER_Y)return FLOWER_Y;
 if(id===LEAF)return null; // leaves: block itself never drops — APPLE handled separately in onBlockMined
 if(typeof ICE!=='undefined'&&id===ICE)return null;
 if(typeof COAL_ORE!=='undefined'&&id===COAL_ORE)return (typeof COAL!=='undefined')?COAL:id;
 if(typeof DIAMOND_ORE!=='undefined'&&id===DIAMOND_ORE)return (typeof DIAMOND!=='undefined')?DIAMOND:id;
 return id;
}

// ===== TOOL GATING (v3) =====
// Pick tiers: WOOD_PICK=1 STONE_PICK=2 IRON_PICK=3 DIAMOND_PICK=4. axe/shovel are tier1 (wood-class only per brief).
function toolInfo(){
 var id=(typeof getSelectedItemId==='function')?getSelectedItemId():null;
 if(id===null||id===undefined)return null;
 if(typeof ITEMS==='undefined'||!ITEMS)return null;
 var it=ITEMS[id];
 if(!it)return null;
 return it;
}

// which pick-tier (1..3) a needsPick block requires; 0 = no pick needed.
function survivalPickTierReq(id){
 if(typeof COAL_ORE!=='undefined'&&id===COAL_ORE)return 1;
 if(typeof GOLD_ORE!=='undefined'&&id===GOLD_ORE)return 3;
 if(typeof DIAMOND_ORE!=='undefined'&&id===DIAMOND_ORE)return 3;
 if(typeof IRON_ORE!=='undefined'&&id===IRON_ORE)return 2;
 if(id===STONE||id===COBBLE||id===BRICK)return 1;
 if(typeof SANDSTONE!=='undefined'&&id===SANDSTONE)return 1;
 if(typeof FURNACE!=='undefined'&&id===FURNACE)return 1;
 if(typeof ICE!=='undefined'&&id===ICE)return 1;
 return 0;
}

function canHarvest(blockId){
 var req=survivalPickTierReq(blockId);
 if(req<=0)return true;
 var it=toolInfo();
 if(!it||it.tool!=='pick')return false;
 return (it.tier||0)>=req;
}

// speed multiplier for correct-CLASS tool on this block (1 = no bonus).
// pick on pick-class(needsPick>0) blocks; axe on LOG/PLANK; shovel on dirt-family blocks.
function survivalToolSpeedMult(blockId){
 var it=toolInfo();
 if(!it)return 1;
 var tier=it.tier||1;
 var isPickClass=survivalPickTierReq(blockId)>0;
 var isAxeClass=(blockId===LOG||blockId===PLANK);
 var isShovelClass=(blockId===DIRT||blockId===GRASS||blockId===SAND||
   (typeof SNOWGRASS!=='undefined'&&blockId===SNOWGRASS)||
   (typeof SNOWBLK!=='undefined'&&blockId===SNOWBLK));
 var mult=1;
 if(it.tool==='pick'&&isPickClass)mult=2+2*(tier-1);
 else if(it.tool==='axe'&&isAxeClass)mult=2;
 else if(it.tool==='shovel'&&isShovelClass)mult=2;
 else return 1;
 return Math.min(8,mult);
}

// ===== DOM (lazy init — elements exist by the time these run) =====

function survivalDmgFlashEl(){
 if(!dmgFlashEl){
  dmgFlashEl=document.createElement('div');
  dmgFlashEl.id='dmgflash';
  dmgFlashEl.style.position='fixed';
  dmgFlashEl.style.inset='0';
  dmgFlashEl.style.zIndex='9';
  dmgFlashEl.style.pointerEvents='none';
  dmgFlashEl.style.background='radial-gradient(ellipse at 50% 50%, rgba(200,0,0,0) 55%, rgba(180,0,0,0.55) 100%)';
  dmgFlashEl.style.opacity='0';
  dmgFlashEl.style.transition='opacity 0.09s ease-out';
  document.body.appendChild(dmgFlashEl);
 }
 return dmgFlashEl;
}
function survivalFlash(){
 var el=survivalDmgFlashEl();
 el.style.transition='opacity 0.02s';
 el.style.opacity='1';
 setTimeout(function(){
  el.style.transition='opacity 0.4s ease-out';
  el.style.opacity='0';
 },70);
}
function survivalHeartsEl(){if(!heartsEl)heartsEl=document.getElementById('hearts');return heartsEl;}
function survivalBubblesEl(){if(!bubblesEl)bubblesEl=document.getElementById('bubbles');return bubblesEl;}
function survivalMineprogEl(){if(!mineprogEl)mineprogEl=document.getElementById('mineprog');return mineprogEl;}
function survivalMineprogFEl(){if(!mineprogFEl)mineprogFEl=document.getElementById('mineprogF');return mineprogFEl;}
function survivalHungerEl(){if(!hungerEl)hungerEl=document.getElementById('hunger');return hungerEl;}

// ===== RENDER (cheap DOM writes, only when content actually changes) =====

function survivalRenderHearts(){
 var el=survivalHeartsEl();if(!el)return;
 var full=Math.floor(hp/2),half=hp%2===1;
 var html='';
 for(var i=0;i<10;i++){
  if(i<full)html+='<span class="hp">♥</span>';
  else if(i===full&&half)html+='<span class="hp">♥</span>';
  else html+='<span class="hd">♥</span>';
 }
 if(html!==lastHeartsHTML){el.innerHTML=html;lastHeartsHTML=html;}
}
function survivalRenderBubbles(){
 var el=survivalBubblesEl();if(!el)return;
 var html='';
 if(air<10){
  var n=Math.max(0,Math.ceil(air));
  for(var i=0;i<10;i++)html+=(i<n?'<span>●</span>':'<span style="opacity:.25">●</span>');
 }
 if(html!==lastBubblesHTML){el.innerHTML=html;el.style.display=html?'block':'none';lastBubblesHTML=html;}
}
function survivalRenderHunger(){
 var el=survivalHungerEl();if(!el)return;
 if(gamemode==='creative'){
  if(el.style.display!=='none'){el.style.display='none';}
  return;
 }
 var full=Math.floor(hunger/2),half=hunger%2===1;
 var html='';
 for(var i=9;i>=0;i--){
  // right-aligned: fill from the right-most glyph inward, matching hearts convention mirrored
  if((9-i)<full)html+='<span class="hf">🍗</span>';
  else if((9-i)===full&&half)html+='<span class="hf">🍗</span>';
  else html+='<span class="he">🍗</span>';
 }
 if(html!==lastHungerHTML){el.innerHTML=html;el.style.display='block';lastHungerHTML=html;}
}

// ===== DAMAGE / DEATH =====

function damagePlayer(n,cause){
 if(typeof armorReduce==='function')n=armorReduce(n,cause);
 if(gamemode==='creative')return;
 if(dead)return;
 if(n<=0)return;
 hp-=n;
 lastDamageT=0; // reset "time since last damage" clock — survivalTick advances it
 regenAcc=0;
 survivalFlash();
 blip(90,50,0.2,0.12);
 survivalRenderHearts();
 if(hp<=0){
  hp=0;
  survivalRenderHearts();
  if(typeof playerDied==='function')playerDied(cause||'You died');
 }
}

function onFallImpact(speed){
 if(gamemode==='creative')return;
 if(dead)return;
 var dmg=Math.ceil((speed-11)*0.55);
 if(dmg>0)damagePlayer(dmg,'Fell from a high place');
}

// ===== PER-FRAME TICK (regen, hunger, drowning, air, hud) =====

function survivalTick(dt){
 if(dead)return;
 lastDamageT+=dt;
 if(gamemode!=='creative'){
  // ---- hunger drain ----
  var hsp=Math.sqrt(P.vx*P.vx+P.vz*P.vz);
  var drain=0.03*dt;
  if(hsp>5.6)drain+=0.10*dt;
  if(typeof mining!=='undefined'&&mining)drain+=0.03*dt;
  // jump detection: rising edge of P.vy crossing above 7
  if(P.vy>7&&prevVy<=7)drain+=0.05;
  prevVy=P.vy;
  if(drain>0){
   hunger=Math.max(0,hunger-drain);
   survivalRenderHunger();
  }
  // ---- regen: +1 hp every 4s once 5s have passed since last damage, while hp<20, hunger-gated ----
  if(hp<20&&lastDamageT>=4&&hunger>=18){
   regenAcc+=dt;
   var regenNeed=(hunger>=19.5)?1.8:3.5;
   if(regenAcc>=regenNeed){
    regenAcc=0;
    hp=Math.min(20,hp+1);
    hunger=Math.max(0,hunger-0.4);
    survivalRenderHearts();
    survivalRenderHunger();
   }
  }else{
   regenAcc=0;
  }
  // ---- starvation: 1 dmg every 3s while hunger<=0, never below hp=2 ----
  if(hunger<=0){
   starveAcc+=dt;
   if(starveAcc>=3){
    starveAcc=0;
    if(hp>2)damagePlayer(1,'Starved to death');
   }
  }else{
   starveAcc=0;
  }
  // ---- drowning / air ----
  if(eyeInWater()){
   if(air>0){
    air=Math.max(0,air-dt);
    survivalRenderBubbles();
   }
   if(air<=0){
    drownAcc+=dt;
    if(drownAcc>=1.5){drownAcc=0;damagePlayer(2,'Drowned');}
   }else{
    drownAcc=0;
   }
  }else{
   if(air<10){
    air=Math.min(10,air+dt*4); // refill fast when out of water
    survivalRenderBubbles();
   }
   drownAcc=0;
  }
 }
 survivalRenderHearts();
 survivalRenderBubbles();
 survivalRenderHunger();
}

// ===== MINING PROGRESS (tool-gated speed) =====

function survivalMineTick(dt,ray){
 if(!ray)return false;
 var key=ray.x+','+ray.y+','+ray.z;
 if(key!==mineKey){mineKey=key;mineProg=0;}
 var hard=survivalHardness(ray.id);
 if(hard===Infinity){
  var el=survivalMineprogEl();if(el)el.style.display='none';
  return false;
 }
 // tool scaling: wrong/no tool on a needsPick block -> 3.5x slower.
 // correct-class tool held -> divide time by the class speed multiplier (capped at 8x, done inside the helper).
 var req=survivalPickTierReq(ray.id);
 var effDt=dt;
 if(req>0&&!canHarvest(ray.id)){
  effDt=dt/3.5;
 }else{
  var mult=survivalToolSpeedMult(ray.id);
  if(mult>1)effDt=dt*mult;
 }
 mineProg+=effDt/hard;
 var pel=survivalMineprogEl(),fel=survivalMineprogFEl();
 if(pel)pel.style.display='block';
 if(fel)fel.style.width=(Math.min(1,mineProg)*100)+'%';
 if(mineProg>=1){
  mineProg=0;mineKey=null;
  if(pel)pel.style.display='none';
  return true;
 }
 return false;
}
function survivalMineReset(){
 mineProg=0;mineKey=null;
 var el=survivalMineprogEl();if(el)el.style.display='none';
 var fel=survivalMineprogFEl();if(fel)fel.style.width='0%';
}

// ===== INVENTORY HOOKS (v3: delegate to module 47's invAdd/invTake/invCount; typeof-guarded) =====

function survivalRefreshCounts(){
 // module 47 (Satchel) owns refreshCounts(); no-op here if it isn't loaded.
 if(typeof refreshCounts==='function')refreshCounts();
}

function onBlockMined(id,bx,by,bz){
 if(gamemode!=='survival')return;
 if(!canHarvest(id))return; // wrong/no tool on a needsPick block: breaks, but drops nothing
 var hasEnt=(typeof spawnDrop==='function'&&bx!==undefined);
 if(id===LEAF){
  if(Math.random()<0.08&&typeof APPLE!=='undefined'){
   if(hasEnt)spawnDrop(bx,by,bz,APPLE,1);
   else if(typeof invAdd==='function')invAdd(APPLE,1);
  }
  survivalRefreshCounts();
  return;
 }
 var drop=survivalDrop(id);
 if(drop===null||drop===undefined)return;
 if(hasEnt)spawnDrop(bx,by,bz,drop,1);
 else if(typeof invAdd==='function')invAdd(drop,1);
 survivalRefreshCounts();
}

// tryEat(id): consumes a food item from inventory and restores hunger. Survival only.
function tryEat(id){
 if(gamemode==='creative')return false;
 if(typeof ITEMS==='undefined'||!ITEMS)return false;
 var it=ITEMS[id];
 if(!it||!it.food)return false;
 if(hunger>=19.5){
  toast('Not hungry');
  return true; // consumed the click, not the item
 }
 if(typeof invTake==='function'&&invTake(id,1)){
  hunger=Math.min(20,hunger+it.food);
  if(it.heal){hp=Math.min(20,hp+it.heal);survivalRenderHearts();toast('You feel renewed');}
  blip(150,90,0.2,0.09);
  survivalRenderHunger();
  survivalRefreshCounts();
  return true;
 }
 return false;
}

function tryConsume(id){
 if(gamemode==='creative')return true;
 if(typeof invTake==='function'){
  if(invTake(id,1)){
   survivalRefreshCounts();
   return true;
  }
  var nm=(BLOCKS[id]&&BLOCKS[id].n)||'that';
  toast('Out of '+nm);
  return false;
 }
 // graceful degradation: module 47 not loaded — can't verify stock, allow (matches "degrade" instruction).
 return true;
}

// ===== GAMEMODE / RESPAWN HOOKS =====

function survivalOnGamemode(m){
 if(m==='creative'){
  if(typeof setSlotCounts==='function')setSlotCounts(null);
 }else{
  survivalRefreshCounts();
 }
 lastHungerHTML=null;
 survivalRenderHunger();
 if(typeof buildHotbar==='function')buildHotbar();
}

function survivalOnRespawn(){
 hp=20;air=10;hunger=20;regenAcc=0;drownAcc=0;starveAcc=0;lastDamageT=999;
 lastHeartsHTML=null;lastBubblesHTML=null;lastHungerHTML=null;
 survivalRenderHearts();survivalRenderBubbles();survivalRenderHunger();
 survivalMineReset();
}
