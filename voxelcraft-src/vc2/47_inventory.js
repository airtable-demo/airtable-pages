// MODULE 47: inventory store, hotbar slot assignment, E-screen render, crafting (OWNER: Satchel)
// NOTE: top-level = declarations + plain data + one load-from-storage call. No other side effects here.

var INV_KEY='voxelcraft_inv_v1';
var inventory={};
var hotbarSlots=[null,null,null,null,null,null,null,null,null];
var invSaveT=null;

// ----- item id constants (module 14 owns the real globals; we fall back to the
// fixed numeric ids from HARNESS.md so this module works standalone at load time) -----
var INV_STICK=(typeof STICK!=='undefined')?STICK:100;
var INV_PORKCHOP=(typeof PORKCHOP!=='undefined')?PORKCHOP:101;
var INV_APPLE=(typeof APPLE!=='undefined')?APPLE:102;
var INV_BEEF=(typeof BEEF!=='undefined')?BEEF:103;
var INV_CHICKEN_MEAT=(typeof CHICKEN_MEAT!=='undefined')?CHICKEN_MEAT:104;
var INV_IRON_INGOT=(typeof IRON_INGOT!=='undefined')?IRON_INGOT:105;
var INV_GOLD_INGOT=(typeof GOLD_INGOT!=='undefined')?GOLD_INGOT:106;
var INV_DIAMOND=(typeof DIAMOND!=='undefined')?DIAMOND:107;
var INV_COAL=(typeof COAL!=='undefined')?COAL:108;
var INV_WOOD_PICK=(typeof WOOD_PICK!=='undefined')?WOOD_PICK:110;
var INV_STONE_PICK=(typeof STONE_PICK!=='undefined')?STONE_PICK:111;
var INV_IRON_PICK=(typeof IRON_PICK!=='undefined')?IRON_PICK:112;
var INV_DIAMOND_PICK=(typeof DIAMOND_PICK!=='undefined')?DIAMOND_PICK:113;
var INV_WOOD_AXE=(typeof WOOD_AXE!=='undefined')?WOOD_AXE:114;
var INV_WOOD_SHOVEL=(typeof WOOD_SHOVEL!=='undefined')?WOOD_SHOVEL:115;
var INV_STONE_SWORD=(typeof STONE_SWORD!=='undefined')?STONE_SWORD:116;
var INV_IRON_SWORD=(typeof IRON_SWORD!=='undefined')?IRON_SWORD:117;
var INV_STEAK=(typeof STEAK!=='undefined')?STEAK:120;
var INV_COOKED_CHICKEN=(typeof COOKED_CHICKEN!=='undefined')?COOKED_CHICKEN:121;
var INV_COOKED_PORKCHOP=(typeof COOKED_PORKCHOP!=='undefined')?COOKED_PORKCHOP:122;
var INV_GOLDEN_APPLE=(typeof GOLDEN_APPLE!=='undefined')?GOLDEN_APPLE:123;
// block ids used in recipes/smelting
var INV_LOG=(typeof LOG!=='undefined')?LOG:5;
var INV_PLANK=(typeof PLANK!=='undefined')?PLANK:7;
var INV_GLASS=8;
var INV_STONE=3;
var INV_SAND=4;
var INV_COBBLE=(typeof COBBLE!=='undefined')?COBBLE:10;
var INV_IRON_ORE=(typeof IRON_ORE!=='undefined')?IRON_ORE:23;
var INV_GOLD_ORE=(typeof GOLD_ORE!=='undefined')?GOLD_ORE:24;
var INV_DIAMOND_ORE=(typeof DIAMOND_ORE!=='undefined')?DIAMOND_ORE:25;
var INV_TORCH_BLOCK=26;
var INV_FURNACE_BLOCK=31;

// ----- persistence -----
function invLoad(){
 try{
  var raw=localStorage.getItem(INV_KEY);
  if(!raw)return;
  var data=JSON.parse(raw);
  if(!data||typeof data!=='object')return;
  var inv={};
  if(data.inv&&typeof data.inv==='object'){
   for(var k in data.inv){
    if(!data.inv.hasOwnProperty(k))continue;
    var n=data.inv[k];
    if(typeof n==='number'&&n>0)inv[k]=Math.floor(n);
   }
  }
  inventory=inv;
  var hb=[null,null,null,null,null,null,null,null,null];
  if(Array.isArray(data.hotbar)){
   for(var i=0;i<9;i++){
    var v=data.hotbar[i];
    hb[i]=(typeof v==='number')?v:null;
   }
  }
  hotbarSlots=hb;
 }catch(e){
  inventory={};
  hotbarSlots=[null,null,null,null,null,null,null,null,null];
 }
}
function invSaveNow(){
 try{
  localStorage.setItem(INV_KEY,JSON.stringify({inv:inventory,hotbar:hotbarSlots}));
 }catch(e){}
}
function invSave(){
 if(invSaveT)clearTimeout(invSaveT);
 invSaveT=setTimeout(function(){invSaveT=null;invSaveNow();},500);
}
invLoad();

// ----- core data ops -----
function invAdd(id,n){
 if(id===null||id===undefined||!n||n<=0)return;
 inventory[id]=(inventory[id]||0)+n;
 invSave();
 var autoAssigned=false;
 if(gamemode==='survival'){
  var already=false;
  for(var i=0;i<9;i++){if(hotbarSlots[i]===id){already=true;break;}}
  if(!already){
   for(var j=0;j<9;j++){
    if(hotbarSlots[j]===null||hotbarSlots[j]===undefined){
     hotbarSlots[j]=id;
     invSave();
     if(typeof buildHotbar==='function')buildHotbar();
     autoAssigned=true;
     break;
    }
   }
  }
 }
 if(!autoAssigned)refreshCounts();
}
function invTake(id,n){
 if(id===null||id===undefined||!n||n<=0)return false;
 var have=inventory[id]||0;
 if(have<n)return false;
 have-=n;
 if(have<=0)delete inventory[id];
 else inventory[id]=have;
 invSave();
 refreshCounts();
 return true;
}
function invCount(id){
 return inventory[id]||0;
}
function invAll(){
 return inventory;
}

// ----- hotbar slot assignment -----
function getHotbarSlots(){
 return hotbarSlots;
}
function setHotbarSlot(i,id){
 if(i<0||i>8)return;
 if(id!==null&&id!==undefined){
  for(var j=0;j<9;j++){
   if(j!==i&&hotbarSlots[j]===id){
    hotbarSlots[j]=hotbarSlots[i];
    break;
   }
  }
 }
 hotbarSlots[i]=id;
 invSave();
 if(typeof buildHotbar==='function')buildHotbar();
}
function getSelectedItemId(){
 if(gamemode==='survival')return hotbarSlots[sel];
 return HOTBAR[sel];
}

// ----- hotbar count badges -----
function refreshCounts(){
 if(gamemode==='survival')setSlotCounts(inventory);
 else setSlotCounts(null);
}

// ----- canonical recipes v2 (HARNESS.md V6 ADDENDUM) -----
function invRecipes(){
 return [
  {out:INV_PLANK,outN:4,label:'1 Log -> 4 Planks',ing:[{id:INV_LOG,n:1}]},
  {out:INV_STICK,outN:4,label:'2 Planks -> 4 Sticks',ing:[{id:INV_PLANK,n:2}]},
  {out:INV_WOOD_PICK,outN:1,label:'3 Planks + 2 Sticks -> Wooden Pickaxe',ing:[{id:INV_PLANK,n:3},{id:INV_STICK,n:2}]},
  {out:INV_STONE_PICK,outN:1,label:'3 Cobble + 2 Sticks -> Stone Pickaxe',ing:[{id:INV_COBBLE,n:3},{id:INV_STICK,n:2}]},
  {out:INV_IRON_PICK,outN:1,label:'3 Iron Ingot + 2 Sticks -> Iron Pickaxe',ing:[{id:INV_IRON_INGOT,n:3},{id:INV_STICK,n:2}]},
  {out:INV_DIAMOND_PICK,outN:1,label:'3 Diamond + 2 Sticks -> Diamond Pickaxe',ing:[{id:INV_DIAMOND,n:3},{id:INV_STICK,n:2}]},
  {out:INV_WOOD_AXE,outN:1,label:'3 Planks + 2 Sticks -> Wooden Axe',ing:[{id:INV_PLANK,n:3},{id:INV_STICK,n:2}]},
  {out:INV_WOOD_SHOVEL,outN:1,label:'1 Plank + 2 Sticks -> Wooden Shovel',ing:[{id:INV_PLANK,n:1},{id:INV_STICK,n:2}]},
  {out:INV_STONE_SWORD,outN:1,label:'2 Cobble + 1 Stick -> Stone Sword',ing:[{id:INV_COBBLE,n:2},{id:INV_STICK,n:1}]},
  {out:32,outN:1,label:'8 Planks -> Chest',ing:[{id:INV_PLANK,n:8}]},
  {out:34,outN:1,label:'4 Planks -> Crafting Table',ing:[{id:INV_PLANK,n:4}]},
  {out:33,outN:1,label:'3 Wool + 3 Planks -> Bed',ing:[{id:27,n:3},{id:INV_PLANK,n:3}]},
  {out:130,outN:1,label:'5 Iron Ingot -> Iron Helmet',ing:[{id:105,n:5}]},
  {out:131,outN:1,label:'8 Iron Ingot -> Iron Chestplate',ing:[{id:105,n:8}]},
  {out:132,outN:1,label:'7 Iron Ingot -> Iron Leggings',ing:[{id:105,n:7}]},
  {out:133,outN:1,label:'4 Iron Ingot -> Iron Boots',ing:[{id:105,n:4}]},
  {out:134,outN:1,label:'5 Gold Ingot -> Gold Helmet',ing:[{id:106,n:5}]},
  {out:135,outN:1,label:'8 Gold Ingot -> Gold Chestplate',ing:[{id:106,n:8}]},
  {out:136,outN:1,label:'7 Gold Ingot -> Gold Leggings',ing:[{id:106,n:7}]},
  {out:137,outN:1,label:'4 Gold Ingot -> Gold Boots',ing:[{id:106,n:4}]},
  {out:138,outN:1,label:'5 Diamond -> Diamond Helmet',ing:[{id:107,n:5}]},
  {out:139,outN:1,label:'8 Diamond -> Diamond Chestplate',ing:[{id:107,n:8}]},
  {out:140,outN:1,label:'7 Diamond -> Diamond Leggings',ing:[{id:107,n:7}]},
  {out:141,outN:1,label:'4 Diamond -> Diamond Boots',ing:[{id:107,n:4}]},
  {out:INV_IRON_SWORD,outN:1,label:'2 Iron Ingot + 1 Stick -> Iron Sword',ing:[{id:INV_IRON_INGOT,n:2},{id:INV_STICK,n:1}]},
  {out:INV_FURNACE_BLOCK,outN:1,label:'8 Cobble -> Furnace',ing:[{id:INV_COBBLE,n:8}]},
  {out:INV_TORCH_BLOCK,outN:4,label:'1 Coal + 1 Stick -> 4 Torches',ing:[{id:INV_COAL,n:1},{id:INV_STICK,n:1}]},
  {out:INV_GOLDEN_APPLE,outN:1,label:'1 Apple + 4 Gold Ingot -> Golden Apple',ing:[{id:INV_APPLE,n:1},{id:INV_GOLD_INGOT,n:4}]}
 ];
}
function invCanAfford(recipe){
 for(var i=0;i<recipe.ing.length;i++){
  if(invCount(recipe.ing[i].id)<recipe.ing[i].n)return false;
 }
 return true;
}
function invCraft(recipe){
 if(!invCanAfford(recipe))return false;
 for(var i=0;i<recipe.ing.length;i++){
  invTake(recipe.ing[i].id,recipe.ing[i].n);
 }
 invAdd(recipe.out,recipe.outN);
 return true;
}

// ----- smelting helpers -----
function nearFurnace(){
 var px=Math.floor(P.x);
 var py=Math.floor(P.y);
 var pz=Math.floor(P.z);
 for(var dx=-4;dx<=4;dx++){
  for(var dy=-4;dy<=4;dy++){
   var wy=py+dy;
   if(wy<1)wy=1;
   if(wy>62)wy=62;
   for(var dz=-4;dz<=4;dz++){
    if(getBlock(px+dx,wy,pz+dz,0)===INV_FURNACE_BLOCK)return true;
   }
  }
 }
 return false;
}

function invSmeltRecipes(){
 return [
  {inId:INV_IRON_ORE,outId:INV_IRON_INGOT,label:'Iron Ore + Coal -> Iron Ingot'},
  {inId:INV_GOLD_ORE,outId:INV_GOLD_INGOT,label:'Gold Ore + Coal -> Gold Ingot'},
  {inId:INV_PORKCHOP,outId:INV_COOKED_PORKCHOP,label:'Porkchop + Coal -> Cooked Porkchop'},
  {inId:INV_BEEF,outId:INV_STEAK,label:'Beef + Coal -> Steak'},
  {inId:INV_CHICKEN_MEAT,outId:INV_COOKED_CHICKEN,label:'Chicken + Coal -> Cooked Chicken'},
  {inId:INV_SAND,outId:INV_GLASS,label:'Sand + Coal -> Glass'},
  {inId:INV_COBBLE,outId:INV_STONE,label:'Cobble + Coal -> Stone'}
 ];
}

// ----- E-screen rendering -----
function invMakeIconCanvas(id,px){
 var cc=document.createElement('canvas');cc.width=cc.height=(typeof TS!=='undefined')?TS:32;
 var g2=cc.getContext('2d');g2.imageSmoothingEnabled=false;
 if(typeof drawSlotIcon==='function')drawSlotIcon(g2,id);
 return cc;
}
function renderInventory(){
 if(typeof renderCraftGrid==='function')renderCraftGrid();
 var grid=document.getElementById('invGrid');
 if(grid){
  grid.innerHTML='';
  for(var id in inventory){
   if(!inventory.hasOwnProperty(id))continue;
   var cnt=inventory[id];
   if(!cnt||cnt<=0)continue;
   (function(idNum,cnt){
    var cell=document.createElement('div');cell.className='icell';
    cell.title=(typeof slotName==='function')?slotName(idNum):'';
    cell.appendChild(invMakeIconCanvas(idNum));
    var cntEl=document.createElement('div');cntEl.className='icnt';cntEl.textContent=cnt;
    cell.appendChild(cntEl);
    cell.addEventListener('click',function(ev){
     if(ev.shiftKey&&typeof craftGridAdd==='function'){craftGridAdd(idNum);return;}
     setHotbarSlot(sel,idNum);
     renderInventory();
     var nm=(typeof slotName==='function')?slotName(idNum):'';
     toast(nm+' -> slot '+(sel+1));
    });
    grid.appendChild(cell);
   })(Number(id),cnt);
  }
 }
 var list=document.getElementById('craftList');
 if(list){
  list.innerHTML='';
  // --- craft recipes ---
  var recipes=invRecipes();
  for(var r=0;r<recipes.length;r++){
   (function(recipe){
    var row=document.createElement('div');row.className='crow';
    row.appendChild(invMakeIconCanvas(recipe.out));
    var ing=document.createElement('div');ing.className='cing';ing.textContent=recipe.label;
    row.appendChild(ing);
    var btn=document.createElement('button');btn.textContent='CRAFT';
    btn.disabled=!invCanAfford(recipe);
    btn.addEventListener('click',function(){
     if(!invCraft(recipe))return;
     renderInventory();
     if(typeof blip==='function')blip(600,400,0.08,0.08);
    });
    row.appendChild(btn);
    list.appendChild(row);
   })(recipes[r]);
  }
  // --- smelting section ---
  var hasFurnace=nearFurnace();
  var smeltHeading=document.createElement('div');
  smeltHeading.className='crow';
  smeltHeading.style.cssText='opacity:0.6;pointer-events:none;justify-content:center;';
  var smeltLabel=document.createElement('div');smeltLabel.className='cing';
  smeltLabel.textContent=hasFurnace
   ? 'SMELTING — needs a furnace within 4 blocks'
   : 'SMELTING — needs a furnace within 4 blocks (none nearby)';
  smeltHeading.appendChild(smeltLabel);
  list.appendChild(smeltHeading);

  var smelts=invSmeltRecipes();
  for(var s=0;s<smelts.length;s++){
   (function(sr){
    var canSmelt=hasFurnace&&invCount(sr.inId)>=1&&invCount(INV_COAL)>=1;
    var row=document.createElement('div');row.className='crow';
    row.appendChild(invMakeIconCanvas(sr.outId));
    var ing=document.createElement('div');ing.className='cing';ing.textContent=sr.label;
    row.appendChild(ing);
    var btn=document.createElement('button');
    btn.textContent='SMELT';
    btn.disabled=!canSmelt;
    btn.style.cssText='background:rgba(255,150,60,.16);border:1px solid rgba(255,150,60,.6);color:#ffcf9a;';
    btn.addEventListener('click',function(){
     if(!hasFurnace)return;
     if(!invTake(sr.inId,1))return;
     if(!invTake(INV_COAL,1)){invAdd(sr.inId,1);return;}
     invAdd(sr.outId,1);
     if(typeof blip==='function')blip(700,300,0.12,0.09);
     renderInventory();
     if(typeof refreshCounts==='function')refreshCounts();
    });
    row.appendChild(btn);
    list.appendChild(row);
   })(smelts[s]);
  }
 }
}
