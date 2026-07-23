// MODULE 40: player physics + input + look (OWNER: core)
// ===== PLAYER =====

var P={x:SPAWNX,y:40,z:SPAWNZ,vx:0,vy:0,vz:0,grounded:false,fly:false};
(function(){P.y=terrainH(Math.floor(SPAWNX),Math.floor(SPAWNZ))+2;})();
var spawnY=P.y;
var yaw=0,pitch=-0.1,sel=0,mode='mine';
var EYE=1.62,HW=0.3,HH=1.8;
function aabbBlocks(cb){
 var minx=Math.floor(P.x-HW),maxx=Math.floor(P.x+HW);
 var miny=Math.floor(P.y),maxy=Math.floor(P.y+HH);
 var minz=Math.floor(P.z-HW),maxz=Math.floor(P.z+HW);
 for(var bx=minx;bx<=maxx;bx++)for(var by=miny;by<=maxy;by++)for(var bz=minz;bz<=maxz;bz++){
   if(isSolid(getBlock(bx,by,bz,AIR)))if(cb(bx,by,bz))return true;}
 return false;
}
function moveAxis(axis,amt){
 P[axis]+=amt;
 aabbBlocks(function(bx,by,bz){
   if(axis==='x'){if(amt>0)P.x=bx-HW-0.001;else P.x=bx+1+HW+0.001;P.vx=0;}
   else if(axis==='z'){if(amt>0)P.z=bz-HW-0.001;else P.z=bz+1+HW+0.001;P.vz=0;}
   else{if(amt<0){P.y=by+1+0.001;P.grounded=true;}else P.y=by-HH-0.001;P.vy=0;}
   return false; // keep scanning (multiple contacts)
 });
}
function inWater(){return getBlock(Math.floor(P.x),Math.floor(P.y+0.4),Math.floor(P.z),AIR)===WATER;}
function eyeInWater(){return getBlock(Math.floor(P.x),Math.floor(P.y+EYE),Math.floor(P.z),AIR)===WATER;}

// ===== RAYCAST (DDA) =====

function raycast(maxD){
 var dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
 var px=P.x,py=P.y+EYE,pz=P.z;
 var x=Math.floor(px),y=Math.floor(py),z=Math.floor(pz);
 var sx=dir.x>0?1:-1,sy=dir.y>0?1:-1,sz=dir.z>0?1:-1;
 var tdx=dir.x!==0?Math.abs(1/dir.x):Infinity;
 var tdy=dir.y!==0?Math.abs(1/dir.y):Infinity;
 var tdz=dir.z!==0?Math.abs(1/dir.z):Infinity;
 var tmx=dir.x!==0?((sx>0?x+1-px:px-x)*tdx):Infinity;
 var tmy=dir.y!==0?((sy>0?y+1-py:py-y)*tdy):Infinity;
 var tmz=dir.z!==0?((sz>0?z+1-pz:pz-z)*tdz):Infinity;
 var t=0,lx=x,ly=y,lz=z;
 for(var i=0;i<120;i++){
   var id=getBlock(x,y,z,AIR);
   if(id!==AIR&&id!==WATER)return {x:x,y:y,z:z,px:lx,py:ly,pz:lz,id:id};
   lx=x;ly=y;lz=z;
   if(tmx<tmy&&tmx<tmz){x+=sx;t=tmx;tmx+=tdx;}
   else if(tmy<tmz){y+=sy;t=tmy;tmy+=tdy;}
   else{z+=sz;t=tmz;tmz+=tdz;}
   if(t>maxD)break;
 }
 return null;
}
var hl=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004,1.004,1.004)),
 new THREE.LineBasicMaterial({color:0x111111,transparent:true,opacity:0.65}));
hl.visible=false;scene.add(hl);

// ===== INPUT =====

var keys={},state='title',plBlocked=false,plFails=0,hadLock=false,mining=false,mineCd=0,placeTimer=null,relockT=null;
var plForceOff=(typeof location!=='undefined'&&location.search.indexOf('nolock')>=0);
var expectUnlock=false;
function suppressNextUnlockPause(){expectUnlock=true;}
function clearKeys(){for(var k in keys)keys[k]=false;} // ?nolock=1: never grab the cursor, pure mouse-move look
var bobPhase=0,bobOff=0,stepT=1,sprintOn=false,lastWTap=0;
function lookDelta(dx,dy){yaw-=dx*0.0024;pitch-=dy*0.0024;pitch=Math.max(-1.45,Math.min(1.45,pitch));}
function plocked(){return document.pointerLockElement===canvas;}
function tryLock(){
 if(plForceOff||plocked()||state!=='play')return;
 if(typeof isChatOpen==='function'&&isChatOpen())return;
 if(typeof nooksVisible==='function'&&nooksVisible())return;
 try{var pr=canvas.requestPointerLock();
   if(pr&&pr.catch)pr.catch(function(){onLockFail();});
 }catch(e){onLockFail();}
}
function onLockFail(){
 plFails++;
 if(plFails===3&&!plBlocked){plBlocked=true;toast('Cursor lock blocked in this view - mouse-move look enabled');}
 clearTimeout(relockT);
 if(plFails<9)relockT=setTimeout(function(){if(state==='play'&&!plocked())tryLock();},950);
}
document.addEventListener('pointerlockerror',function(){onLockFail();});
document.addEventListener('pointerlockchange',function(){
 if(plocked()){hadLock=true;plFails=0;plBlocked=false;}
 else if(hadLock&&state==='play'){if(expectUnlock){expectUnlock=false;}else pauseGame();}
});
document.addEventListener('keydown',function(e){
 if(typeof chatKeydown==='function'&&chatKeydown(e))return;
 if(e.code==='KeyW'&&!e.repeat&&state==='play'){var nw=performance.now();if(nw-lastWTap<300)sprintOn=true;lastWTap=nw;}
 keys[e.code]=true;
 if(e.code==='Space')e.preventDefault();
 if(state==='title'&&e.code==='Enter')startGame('survival');
 if(state==='play'){
   if(e.code==='KeyF'){P.fly=!P.fly;toast(P.fly?'Flight ON':'Flight OFF');}
   if(e.code==='KeyR'){P.x=SPAWNX;P.z=SPAWNZ;P.y=spawnY;P.vx=P.vy=P.vz=0;toast('Respawned');}
   if(e.code==='KeyG'&&typeof toggleGamemode==='function')toggleGamemode();
   if(e.code==='KeyE'&&typeof openInventory==='function')openInventory();
   if(e.code==='KeyX'&&typeof swapHotbarSet==='function')swapHotbarSet();
   if(e.code.indexOf('Digit')===0){var n=+e.code.slice(5);if(n>=1&&n<=9)selSlot(n-1);}
   if(e.code==='Escape'&&!plocked())pauseGame();
 }else if(state==='pause'&&e.code==='Escape'){resumeGame();}
 else if(state==='inv'){
   if(e.code==='KeyE'||e.code==='Escape'){if(typeof closeInventory==='function')closeInventory();}
   if(e.code.indexOf('Digit')===0){var n2=+e.code.slice(5);if(n2>=1&&n2<=9)selSlot(n2-1);}
 }
});
document.addEventListener('keyup',function(e){keys[e.code]=false;if(e.code==='KeyW')sprintOn=false;});
// LOOK: pointer-lock deltas when locked; bare mouse-move deltas when lock is unavailable.
// No click-drag requirement anywhere.
document.addEventListener('mousemove',function(e){
 if(state!=='play')return;
 if(typeof nooksDragging!=='undefined'&&nooksDragging)return;
 var mx=e.movementX||0,my=e.movementY||0;
 if(plocked()){lookDelta(mx,my);return;}
 if((plBlocked||!hadLock||plForceOff||(typeof nooksVisible==='function'&&nooksVisible()))&&e.target===canvas)lookDelta(mx,my);
});
canvas.addEventListener('mousedown',function(e){
 if(state!=='play')return;
 if(typeof isChatOpen==='function'&&isChatOpen()){if(typeof closeChat==='function')closeChat();return;}
 if(!plocked()&&!plBlocked&&!plForceOff){tryLock();return;}
 if(e.button===0){mining=true;mineCd=0;}
 if(e.button===2){act('place');clearInterval(placeTimer);placeTimer=setInterval(function(){act('place');},260);}
});
document.addEventListener('mouseup',function(){
 mining=false;clearInterval(placeTimer);
 if(typeof survivalMineReset==='function')survivalMineReset();
});
document.addEventListener('contextmenu',function(e){e.preventDefault();});
document.addEventListener('wheel',function(e){if(state!=='play')return;selSlot((sel+(e.deltaY>0?1:-1)+HOTBAR.length)%HOTBAR.length);},{passive:true});
// touch
var joyEl=document.getElementById('joy'),joyK=document.getElementById('joyK'),joyVec={x:0,y:0},joyId=null,lookId=null,lookLast={},tapT=0,tapX=0,tapY=0;
document.getElementById('btnJump').addEventListener('touchstart',function(e){e.preventDefault();keys.Space=true;},{passive:false});
document.getElementById('btnJump').addEventListener('touchend',function(){keys.Space=false;});
document.getElementById('btnMode').addEventListener('touchstart',function(e){e.preventDefault();mode=(mode==='mine')?'build':'mine';
 document.getElementById('btnMode').textContent=mode.toUpperCase();},{passive:false});
canvas.addEventListener('touchstart',function(e){
 if(state!=='play')return;
 for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i];
   if(t.clientX<innerWidth*0.38&&joyId===null){joyId=t.identifier;joyEl._cx=t.clientX;joyEl._cy=t.clientY;}
   else if(lookId===null){lookId=t.identifier;lookLast.x=t.clientX;lookLast.y=t.clientY;tapT=Date.now();tapX=t.clientX;tapY=t.clientY;}}
},{passive:true});
canvas.addEventListener('touchmove',function(e){
 if(state!=='play')return;
 for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i];
   if(t.identifier===joyId){var dx=(t.clientX-joyEl._cx)/45,dy=(t.clientY-joyEl._cy)/45;
     var l=Math.sqrt(dx*dx+dy*dy);if(l>1){dx/=l;dy/=l;}joyVec.x=dx;joyVec.y=dy;
     joyK.style.left=(38+dx*30)+'px';joyK.style.top=(38+dy*30)+'px';}
   else if(t.identifier===lookId){lookDelta((t.clientX-lookLast.x)*2.2,(t.clientY-lookLast.y)*2.2);lookLast.x=t.clientX;lookLast.y=t.clientY;}}
},{passive:true});
canvas.addEventListener('touchend',function(e){
 for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i];
   if(t.identifier===joyId){joyId=null;joyVec.x=joyVec.y=0;joyK.style.left='38px';joyK.style.top='38px';}
   else if(t.identifier===lookId){lookId=null;
     if(Date.now()-tapT<230&&Math.abs(t.clientX-tapX)<10&&Math.abs(t.clientY-tapY)<10)act(mode);}}
},{passive:true});

function doBreak(r){
 if(r.id===BEDROCK){toast('Bedrock is unbreakable');return;}
 setBlock(r.x,r.y,r.z,AIR);
 burst(r.x,r.y,r.z,PCOL[r.id]||0x999999);
 blip(300,90,0.09,0.12);
 if(typeof CHEST!=='undefined'&&r.id===CHEST&&typeof chestOnBroken==='function')chestOnBroken(r.x,r.y,r.z);
 if(typeof onBlockMined==='function')onBlockMined(r.id,r.x,r.y,r.z);
}
function mineFrame(dt){
 mineCd-=dt;
 if(typeof hitDragon==='function'&&mineCd<=0&&hitDragon()){mineCd=0.32;if(typeof survivalMineReset==='function')survivalMineReset();return;}
 if(typeof hitMob==='function'&&mineCd<=0&&hitMob()){mineCd=0.32;if(typeof survivalMineReset==='function')survivalMineReset();return;}
 var r=raycast(7);
 if(!r){if(typeof survivalMineReset==='function')survivalMineReset();return;}
 if(gamemode==='creative'){if(mineCd<=0){mineCd=0.22;doBreak(r);}return;}
 if(typeof survivalMineTick==='function'){if(survivalMineTick(dt,r))doBreak(r);}
 else if(mineCd<=0){mineCd=0.3;doBreak(r);}
}
function act(kind){
 var r=raycast(7);
 if(!r)return;
 if(kind==='mine'){
   if(typeof hitDragon==='function'&&hitDragon())return;
   if(typeof hitMob==='function'&&hitMob())return;
   doBreak(r);
 }else{
   if(typeof CRAFT_TABLE!=='undefined'&&r.id===CRAFT_TABLE&&typeof openCraftTable==='function'){openCraftTable();return;}
   if(typeof CHEST!=='undefined'&&r.id===CHEST&&typeof openChest==='function'){openChest(r.x,r.y,r.z);return;}
   if(typeof BED!=='undefined'&&r.id===BED&&typeof useBed==='function'){useBed(r.x,r.y,r.z);return;}
   if(typeof FURNACE!=='undefined'&&r.id===FURNACE&&gamemode==='survival'&&typeof openInventory==='function'){openInventory();return;}
   var pid=(typeof getSelectedItemId==='function')?getSelectedItemId():HOTBAR[sel];
   if(pid===null||pid===undefined)return;
   if(typeof tryEat==='function'&&tryEat(pid))return;
   if(typeof isBlockId==='function'&&!isBlockId(pid))return;
   var tgt=getBlock(r.px,r.py,r.pz,AIR);
   if(tgt!==AIR&&tgt!==WATER)return;
   var b={x:r.px,y:r.py,z:r.pz};
   if(b.x+1>P.x-HW&&b.x<P.x+HW&&b.y+1>P.y&&b.y<P.y+HH&&b.z+1>P.z-HW&&b.z<P.z+HW)return;
   if(typeof tryConsume==='function'&&!tryConsume(pid))return;
   setBlock(r.px,r.py,r.pz,pid);
   blip(520,340,0.06,0.1);
 }
}
