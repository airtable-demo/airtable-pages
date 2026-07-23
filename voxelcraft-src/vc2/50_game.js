// MODULE 50: hotbar/overlays/main loop (OWNER: core)
// ===== HOTBAR UI =====

var hb=document.getElementById('hotbar'),slotEls=[],hbSet=0;
function drawSlotIcon(g2,id){
 g2.fillStyle='#20283a';g2.fillRect(0,0,TS,TS);
 if(id===null||id===undefined)return;
 if(typeof isBlockId!=='function'||isBlockId(id)){
  var B=BLOCKS[id];if(!B)return;
  var p=tileXY(B.t[2]);
  g2.drawImage(atlasC,p[0],p[1],TS,TS,0,0,TS,TS);
 }else if(typeof drawItemIcon==='function'){drawItemIcon(g2,id,0,0,TS);}
}
function slotName(id){
 if(id===null||id===undefined)return '';
 if(typeof isBlockId!=='function'||isBlockId(id))return BLOCKS[id]?BLOCKS[id].n:'';
 return (typeof ITEMS!=='undefined'&&ITEMS[id])?ITEMS[id].n:'';
}
function buildHotbar(){
 hb.innerHTML='';slotEls=[];
 var slots=(gamemode==='survival'&&typeof getHotbarSlots==='function')?getHotbarSlots():HOTBAR;
 for(var i=0;i<9;i++){
  (function(i){
   var id=(i<slots.length)?slots[i]:null;
   var d=document.createElement('div');d.className='slot'+(i===sel?' sel':'');
   var cc=document.createElement('canvas');cc.width=cc.height=TS;
   var g2=cc.getContext('2d');g2.imageSmoothingEnabled=false;
   drawSlotIcon(g2,id);
   d.appendChild(cc);
   var s2=document.createElement('span');s2.textContent=(i+1);d.appendChild(s2);
   var cn=document.createElement('span');cn.className='cnt';d.appendChild(cn);
   d.title=slotName(id);
   d.addEventListener('click',function(){selSlot(i);});
   hb.appendChild(d);slotEls.push(d);
  })(i);
 }
 if(typeof refreshCounts==='function')refreshCounts();
}
function swapHotbarSet(){
 if(typeof HOTBAR_SETS==='undefined'||HOTBAR_SETS.length<2)return;
 hbSet=(hbSet+1)%HOTBAR_SETS.length;HOTBAR=HOTBAR_SETS[hbSet];
 if(sel>=HOTBAR.length)sel=0;
 buildHotbar();toast('Hotbar '+(hbSet+1)+' / '+HOTBAR_SETS.length+'  (X to swap)');
}
function setSlotCounts(counts){
 slotEls.forEach(function(el,i){var c=el.querySelector('.cnt');var id=HOTBAR[i];
  if(counts&&counts[id]!==undefined)c.textContent=counts[id];else c.textContent='';});
}
function selSlot(i){sel=i;slotEls.forEach(function(e,j){e.classList.toggle('sel',j===i);});}
function toast(msg){var d=document.createElement('div');d.className='toast';d.textContent=msg;
 document.getElementById('toasts').appendChild(d);requestAnimationFrame(function(){d.classList.add('on');});
 setTimeout(function(){d.classList.remove('on');setTimeout(function(){d.remove();},400);},2600);}

// ===== GAME STATE =====

var titleEl=document.getElementById('title'),pauseEl=document.getElementById('pause'),playBtn=document.getElementById('play'),playCBtn=document.getElementById('playC');
var gamemode='survival',dead=false;
buildHotbar();
function setGamemode(m){gamemode=m;
 var g=document.getElementById('gm');if(g)g.textContent=m.toUpperCase();
 if(typeof survivalOnGamemode==='function')survivalOnGamemode(m);}
function toggleGamemode(){setGamemode(gamemode==='survival'?'creative':'survival');toast('Gamemode: '+gamemode+' (G to switch)');}
function startGame(mode){
 if(playBtn.disabled||state==='play')return;
 titleEl.style.display='none';state='play';
 setGamemode(mode||'survival');
 tryLock();
 setTimeout(function(){if(plBlocked)toast('Mouse-move look active (no cursor lock in this view)');},700);
 toast(gamemode==='survival'?'Survival: hold click to mine, blocks drop into your hotbar':'Creative: infinite blocks, instant mining');
}
function pauseGame(){if(state!=='play')return;state='pause';pauseEl.style.display='flex';}
function resumeGame(){if(dead)return;state='play';pauseEl.style.display='none';tryLock();}
function playerDied(cause){
 dead=true;state='dead';mining=false;
 try{document.exitPointerLock();}catch(e){}
 var dc=document.getElementById('deathCause');if(dc)dc.textContent=cause||'You died';
 document.getElementById('death').style.display='flex';
}
function respawn(){
 dead=false;document.getElementById('death').style.display='none';state='play';
 P.x=SPAWNX;P.z=SPAWNZ;P.y=spawnY;P.vx=P.vy=P.vz=0;
 if(typeof survivalOnRespawn==='function')survivalOnRespawn();
 tryLock();
}
playBtn.addEventListener('click',function(){startGame('survival');});
if(playCBtn)playCBtn.addEventListener('click',function(){startGame('creative');});
document.getElementById('resume').addEventListener('click',resumeGame);
var chatBtnEl=document.getElementById('chatBtn');
if(chatBtnEl)chatBtnEl.addEventListener('click',function(){if(state==='play'&&typeof openChat==='function')openChat('');});
var invBtnEl=document.getElementById('invBtn');
if(invBtnEl)invBtnEl.addEventListener('click',function(){if(state==='play')openInventory();else if(state==='inv')closeInventory();});
var respawnBtn=document.getElementById('respawn');
if(respawnBtn)respawnBtn.addEventListener('click',respawn);
function openInventory(){
 if(state!=='play')return;
 if(gamemode!=='survival'){toast('Creative uses hotbar pages - press X');return;}
 state='inv';
 var el=document.getElementById('inv');if(el)el.style.display='flex';
 try{document.exitPointerLock();}catch(e){}
 if(typeof renderInventory==='function')renderInventory();
}
function closeInventory(){
 if(state!=='inv')return;
 var el=document.getElementById('inv');if(el)el.style.display='none';
 state='play';tryLock();
}
document.getElementById('reset').addEventListener('click',function(){
 if(confirm('Generate a NEW world? Fresh seed, fresh spawn — clears this world\'s blocks and inventory.')){localStorage.removeItem(EDIT_KEY);localStorage.removeItem('voxelcraft_inv_v1');localStorage.removeItem('voxelcraft_meta_v1');location.reload();}});

// ===== MAIN LOOP =====
function initWorld(){var scx=Math.floor(SPAWNX/CH),scz=Math.floor(SPAWNZ/CH);for(var idx=scx-1;idx<=scx+1;idx++)for(var jdx=scz-1;jdx<=scz+1;jdx++)genChunk(idx,jdx);chunks.forEach(function(c){buildChunk(c);});}
initWorld();

var lastAimMob=false;
var hookErr={};
function safeHook(name,fn){
 if(hookErr[name]>=5)return;
 try{fn();}catch(e){hookErr[name]=(hookErr[name]||0)+1;
  if(hookErr[name]===5){console.error('module disabled:',name,e);toast('A module hiccuped and was disabled ('+name+') - game continues');}}
}
var last=performance.now(),fpsN=0,fpsT=0,fps=0,ready=false,readyTarget=25;
function frame(now){
 requestAnimationFrame(frame);
 var dt=Math.min(0.05,(now-last)/1000);last=now;
 ensureChunks();
 if(!ready){
   var meshed=0;chunks.forEach(function(c){if(!c.dirty)meshed++;});
   var pct=Math.min(1,meshed/readyTarget);
   document.getElementById('barF').style.width=(pct*100)+'%';
   if(meshed>=readyTarget){ready=true;playBtn.disabled=false;playBtn.textContent='SURVIVAL ▸';if(playCBtn)playCBtn.disabled=false;document.getElementById('bar').style.display='none';}
 }
 if(state==='play'){
   // movement
   var f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
   var wish=new THREE.Vector3();
   if(keys.KeyW||keys.ArrowUp)wish.add(f);
   if(keys.KeyS||keys.ArrowDown)wish.sub(f);
   if(keys.KeyD||keys.ArrowRight)wish.add(r);
   if(keys.KeyA||keys.ArrowLeft)wish.sub(r);
   wish.add(f.clone().multiplyScalar(-joyVec.y)).add(r.clone().multiplyScalar(joyVec.x));
   if(wish.lengthSq()>0)wish.normalize();
   var water=inWater();
   var canSprint=!(gamemode==='survival'&&typeof hunger!=='undefined'&&hunger<=6);
   var spd=P.fly?14:(water?3.2:(((keys.ControlLeft||sprintOn)&&canSprint)?7.2:4.4));
   var ax=wish.x*spd,az=wish.z*spd,k2=Math.min(1,(P.fly?8:12)*dt);
   P.vx+=(ax-P.vx)*k2;P.vz+=(az-P.vz)*k2;
   if(P.fly){P.vy+=(((keys.Space?9:0)+(keys.ShiftLeft?-9:0))-P.vy)*k2;}
   else if(water){P.vy+= (keys.Space? (3.4-P.vy)*Math.min(1,10*dt) : -5*dt);P.vy=Math.max(P.vy,-3.2);}
   else{P.vy-=26*dt;if(P.vy<-42)P.vy=-42;
     if(keys.Space&&P.grounded)P.vy=8.6;}
   P.grounded=false;var preVy=P.vy;
   moveAxis('y',P.vy*dt);
   if(P.grounded&&preVy<-11&&!P.fly&&typeof onFallImpact==='function')onFallImpact(-preVy);
   moveAxis('x',P.vx*dt);
   moveAxis('z',P.vz*dt);
   if(P.y<-12){
     if(typeof inEnd==='function'&&inEnd()){if(typeof endVoid==='function')endVoid();}
     else{P.x=SPAWNX;P.z=SPAWNZ;P.y=spawnY;P.vy=0;toast('The void spat you back out');}
   }
   var hsp=Math.sqrt(P.vx*P.vx+P.vz*P.vz);
   var tf=74+(hsp>5.6?6:0)+(P.fly?4:0);
   if(Math.abs(camera.fov-tf)>0.05){camera.fov+=(tf-camera.fov)*Math.min(1,8*dt);camera.updateProjectionMatrix();}
   if(P.grounded&&hsp>0.6){bobPhase+=hsp*dt*1.75;bobOff=Math.sin(bobPhase*2)*0.045;
     stepT-=hsp*dt;if(stepT<=0){stepT=2.3;var fid=getBlock(Math.floor(P.x),Math.floor(P.y-0.5),Math.floor(P.z),AIR);
       var fr=(fid===GRASS||fid===LEAF)?[170,120]:((fid===SAND||fid===DIRT)?[150,100]:[230,170]);
       blip(fr[0],fr[1],0.045,0.035);}}
   else bobOff*=Math.pow(0.001,dt);
   camera.position.set(P.x,P.y+EYE+bobOff,P.z);
   camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
   // highlight
   var rr=raycast(7);
   if(rr){hl.visible=true;hl.position.set(rr.x+0.5,rr.y+0.5,rr.z+0.5);}else hl.visible=false;
   var aimMob=((typeof mobUnderCrosshair==='function')&&mobUnderCrosshair())||((typeof dragonUnderCrosshair==='function')&&dragonUnderCrosshair());
   if(aimMob!==lastAimMob){lastAimMob=aimMob;var xhEl=document.getElementById('xh');if(xhEl)xhEl.style.color=aimMob?'#ff5b4d':'rgba(255,255,255,.85)';}
   // HUD
   fpsN++;fpsT+=dt;if(fpsT>0.5){fps=Math.round(fpsN/fpsT);fpsN=0;fpsT=0;}
   document.getElementById('coords').innerHTML='XYZ '+P.x.toFixed(0)+' '+P.y.toFixed(0)+' '+P.z.toFixed(0)+'<br>'+fps+' fps · '+chunks.size+' chunks'+(P.fly?' · FLY':'');
 } else if(state==='title'){
   // cinematic orbit
   var t=now/1000;
   var cx=SPAWNX+Math.cos(t*0.12)*26,cz=SPAWNZ+Math.sin(t*0.12)*26;
   camera.position.set(cx,spawnY+12,cz);
   camera.lookAt(SPAWNX,spawnY,SPAWNZ);
 }
 if(state==='play'){
   if(mining)mineFrame(dt);
   safeHook('mobs',function(){if(typeof updateMobs==='function')updateMobs(dt);});
   safeHook('surv',function(){if(typeof survivalTick==='function')survivalTick(dt);});
   safeHook('dragon',function(){if(typeof updateDragon==='function')updateDragon(dt);});
   safeHook('drops',function(){if(typeof updateDrops==='function')updateDrops(dt);});
   safeHook('armor',function(){if(typeof updateArmor==='function')updateArmor(dt);});
 }
 if(typeof updateTorchLights==='function')updateTorchLights(dt);
 safeHook('mp',function(){if(typeof updateMP==='function')updateMP(dt);});
 updateSky(dt);updParts(dt);
 var cloudsVis=!(typeof inEnd==='function'&&inEnd());
 for(var i=0;i<clouds.length;i++){var c=clouds[i];c.visible=cloudsVis;c.position.x+=dt*1.4;
   if(c.position.x>P.x+160)c.position.x=P.x-160;
   if(c.position.x<P.x-170)c.position.x=P.x+150;}
 renderer.render(scene,camera);
}
requestAnimationFrame(frame);
