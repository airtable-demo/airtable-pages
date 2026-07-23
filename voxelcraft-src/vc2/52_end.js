
// ---------- 52_end.js: The End dimension + Ender Dragon + victory ----------
// The End lives at far coordinates (END_CX/END_CZ) in the same chunk engine —
// terrain gen routes there via the cx*CH>50000 branch in genChunk (32_terrain).

var END_CX=100000,END_CZ=100000;
var END_STONE=28,OBSIDIAN=29,DRAGON_EGG=30;
BLOCKS[END_STONE]={n:'End Stone',t:[31,31,31]};
BLOCKS[OBSIDIAN]={n:'Obsidian',t:[32,32,32]};
BLOCKS[DRAGON_EGG]={n:'Dragon Egg',t:[33,33,33]};
PCOL[END_STONE]=0xd8d6a4;PCOL[OBSIDIAN]=0x2a1a3a;PCOL[DRAGON_EGG]=0x3a1a52;
(function(){ // paint tiles 31-33 on the shared block atlas
 function px(){return Math.floor(arand()*TS);}
 var p=tileXY(31);ag.fillStyle='#dbd9a9';ag.fillRect(p[0],p[1],TS,TS);
 for(var i=0;i<200;i++){ag.fillStyle=(i%3===0)?'#cfcd93':'#e8e6bd';ag.fillRect(p[0]+px(),p[1]+px(),2,2);}
 for(var i2=0;i2<24;i2++){ag.fillStyle='#b9b782';ag.fillRect(p[0]+px(),p[1]+px(),3,2);}
 p=tileXY(32);ag.fillStyle='#1d1226';ag.fillRect(p[0],p[1],TS,TS);
 for(var j=0;j<160;j++){ag.fillStyle=(j%2===0)?'#2f1d40':'#120a18';ag.fillRect(p[0]+px(),p[1]+px(),3,3);}
 for(var j2=0;j2<10;j2++){ag.fillStyle='#6a3b8f';ag.fillRect(p[0]+px(),p[1]+px(),1,1);}
 p=tileXY(33);ag.fillStyle='#150a1c';ag.fillRect(p[0],p[1],TS,TS);
 for(var k=0;k<120;k++){ag.fillStyle=(k%2===0)?'#4a2a66':'#241033';ag.fillRect(p[0]+px(),p[1]+px(),2,2);}
 for(var k2=0;k2<8;k2++){ag.fillStyle='#b24bf3';ag.fillRect(p[0]+px(),p[1]+px(),1,1);}
 if(typeof atlas!=='undefined')atlas.needsUpdate=true;
})();

function inEnd(){return P.x>50000;}

function genEndChunk(cx,cz){
 var data=new Uint8Array(CH*CH*WH);
 for(var x=0;x<CH;x++)for(var z=0;z<CH;z++){
  var wx=cx*CH+x,wz=cz*CH+z;
  var dx=wx-END_CX,dz=wz-END_CZ;
  var r=Math.sqrt(dx*dx+dz*dz);
  if(r<58){
   var wob=fbm2(wx*0.045+9000,wz*0.045-9000,2);
   var frac=1-(r/58)*(r/58);
   var th=frac*(7+wob*7);
   if(th>0.6){
    var top=24+Math.floor(wob*4*frac+frac*2);
    var bot=Math.max(3,top-Math.floor(th)-1);
    for(var y=bot;y<=top;y++)data[bi(x,y,z)]=END_STONE;
   }
  }
 }
 for(var pi=0;pi<7;pi++){
  var ang=pi*(Math.PI*2/7)+0.5;
  var pcx=END_CX+Math.round(Math.cos(ang)*27),pcz=END_CZ+Math.round(Math.sin(ang)*27);
  var ph=40+(pi%3)*5;
  for(var ox=-1;ox<=1;ox++)for(var oz=-1;oz<=1;oz++){
   if(Math.abs(ox)===1&&Math.abs(oz)===1)continue;
   var lx=pcx+ox-cx*CH,lz=pcz+oz-cz*CH;
   if(lx<0||lx>15||lz<0||lz>15)continue;
   for(var y2=18;y2<=ph;y2++)data[bi(lx,y2,lz)]=OBSIDIAN;
  }
 }
 for(var axp=-2;axp<=2;axp++)for(var azp=-2;azp<=2;azp++){
  var lx3=(END_CX-45+axp)-cx*CH,lz3=(END_CZ+azp)-cz*CH;
  if(lx3<0||lx3>15||lz3<0||lz3>15)continue;
  data[bi(lx3,30,lz3)]=OBSIDIAN;
  for(var y3=31;y3<=34;y3++)data[bi(lx3,y3,lz3)]=AIR;
 }
 var key=ck(cx,cz);
 var em=edits[key];
 if(em)for(var k in em){var p2=k.split(',');data[bi(+p2[0],+p2[1],+p2[2])]=+em[k];
  if(typeof TORCH!=='undefined'&&+em[k]===TORCH)TORCHES.add((cx*16+(+p2[0]))+','+(+p2[1])+','+(cz*16+(+p2[2])));}
 var ch={cx:cx,cz:cz,data:data,meshO:null,meshT:null,dirty:true};
 chunks.set(key,ch);
 [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var n=chunks.get(ck(cx+d[0],cz+d[1]));if(n)n.dirty=true;});
 return ch;
}

// ---------- sky ----------
function endSky(){
 sunS.visible=false;moonS.visible=false;
 skyColor.setRGB(0.075,0.04,0.12);
 scene.background=skyColor;scene.fog.color.copy(skyColor);
 scene.fog.near=45;scene.fog.far=115;
 amb.intensity=0.52;sun.intensity=0.35;
 sun.position.set(P.x+40,P.y+70,P.z+20);sun.target.position.set(P.x,P.y,P.z);
 stars.material.opacity=0.95;stars.position.set(P.x,0,P.z);
 skyK=0.5; // twilight: blocks zombie night-spawns in the End
}

// ---------- dragon ----------
var dragon={alive:false,hp:60,max:60,g:null,parts:null,mode:'orbit',ang:0,swoopT:9,swoopDur:0,hurtT:0,touchT:0};
function buildDragon(){
 var g=new THREE.Group();
 var mBody=new THREE.MeshLambertMaterial({color:0x191921});
 var mWing=new THREE.MeshLambertMaterial({color:0x23232e,side:THREE.DoubleSide});
 var mEye=new THREE.MeshLambertMaterial({color:0xb24bf3,emissive:0xb24bf3,emissiveIntensity:1});
 var body=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.5,4.2),mBody);g.add(body);
 var neck=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.9,1.6),mBody);neck.position.set(0,0.5,-2.6);g.add(neck);
 var head=new THREE.Mesh(new THREE.BoxGeometry(1.1,0.95,1.5),mBody);head.position.set(0,0.75,-3.9);g.add(head);
 var snout=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.5,0.9),mBody);snout.position.set(0,0.55,-4.95);g.add(snout);
 var e1=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.2,0.2),mEye);e1.position.set(0.42,0.98,-4.15);g.add(e1);
 var e2=e1.clone();e2.position.x=-0.42;g.add(e2);
 var wlG=new THREE.BoxGeometry(5.6,0.12,2.8);wlG.translate(2.8,0,0);
 var wL=new THREE.Mesh(wlG,mWing);wL.position.set(0.7,0.72,-0.4);g.add(wL);
 var wrG=new THREE.BoxGeometry(5.6,0.12,2.8);wrG.translate(-2.8,0,0);
 var wR=new THREE.Mesh(wrG,mWing);wR.position.set(-0.7,0.72,-0.4);g.add(wR);
 var tail=[];
 for(var i=0;i<3;i++){var tb=new THREE.Mesh(new THREE.BoxGeometry(0.8-i*0.2,0.7-i*0.16,1.6),mBody);
  tb.position.set(0,0.1,2.6+i*1.5);g.add(tb);tail.push(tb);}
 g.scale.set(1.7,1.7,1.7);g.visible=false;scene.add(g);
 dragon.g=g;dragon.parts={wL:wL,wR:wR,tail:tail,eyes:[e1,e2],mBody:mBody};
}
function spawnDragon(){
 if(!dragon.g)buildDragon();
 dragon.alive=true;dragon.hp=dragon.max;dragon.mode='orbit';dragon.ang=Math.random()*6;
 dragon.swoopT=8;dragon.g.visible=true;
 dragon.g.position.set(END_CX+30,44,END_CZ);
 updateBossbar();
}
function updateBossbar(){
 var bb=document.getElementById('bossbar'),bf=document.getElementById('bossF');
 if(!bb||!bf)return;
 var show=dragon.alive&&inEnd()&&(state==='play'||state==='inv');
 bb.style.display=show?'block':'none';
 bf.style.width=Math.max(0,(dragon.hp/dragon.max)*100)+'%';
}
function updateDragon(dt){
 if(!dragon.alive||!inEnd()){if(dragon.g)dragon.g.visible=false;var bb=document.getElementById('bossbar');if(bb&&bb.style.display!=='none')bb.style.display='none';return;}
 if(!dragon.g)buildDragon();
 dragon.g.visible=true;
 var t=performance.now()/1000;
 dragon.parts.wL.rotation.z=0.4+Math.sin(t*5.2)*0.55;
 dragon.parts.wR.rotation.z=-0.4-Math.sin(t*5.2)*0.55;
 for(var i=0;i<3;i++)dragon.parts.tail[i].position.x=Math.sin(t*2.2+i*0.9)*0.22*(i+1);
 var target;
 if(dragon.mode==='orbit'){
  dragon.ang+=dt*0.3;
  target=new THREE.Vector3(END_CX+Math.cos(dragon.ang)*30,41+Math.sin(t*0.6)*4,END_CZ+Math.sin(dragon.ang)*30);
  dragon.swoopT-=dt;
  if(dragon.swoopT<=0){dragon.mode='swoop';dragon.swoopDur=3.4;blip(95,45,0.5,0.13);}
 }else{
  target=new THREE.Vector3(P.x,P.y+1.1,P.z);
  dragon.swoopDur-=dt;
  if(dragon.swoopDur<=0){dragon.mode='orbit';dragon.swoopT=7+Math.random()*7;}
 }
 var pos=dragon.g.position;
 var spd=(dragon.mode==='swoop')?15:8.5;
 var dir=target.clone().sub(pos),d=dir.length();
 if(d>0.01){dir.multiplyScalar(Math.min(1,spd*dt/d));pos.add(dir);
  var v=target.clone().sub(pos);if(v.lengthSq()>0.01){v.normalize();dragon.g.rotation.y=Math.atan2(v.x,v.z)+Math.PI;}}
 dragon.touchT-=dt;
 var pdx=pos.x-P.x,pdy=pos.y-(P.y+1),pdz=pos.z-P.z;
 var pd=Math.sqrt(pdx*pdx+pdy*pdy+pdz*pdz);
 if(pd<3.6&&dragon.touchT<=0){
  dragon.touchT=1.2;
  if(gamemode==='survival'&&typeof damagePlayer==='function')damagePlayer(6,'Slain by the Ender Dragon');
  if(pd>0.01){P.vx+=(-pdx/pd)*11;P.vz+=(-pdz/pd)*11;P.vy=Math.max(P.vy,7);}
  blip(70,40,0.3,0.15);
  if(dragon.mode==='swoop'){dragon.mode='orbit';dragon.swoopT=7+Math.random()*6;}
 }
 if(dragon.hurtT>0){dragon.hurtT-=dt;dragon.parts.mBody.color.setHex(0x5a2440);}
 else dragon.parts.mBody.color.setHex(0x191921);
}
function dragonCone(range,minDot){
 if(!dragon.alive||!inEnd()||!dragon.g)return false;
 var f=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
 var to=dragon.g.position.clone();to.y+=0.4;
 to.sub(camera.position);
 var d=to.length();
 if(d>range)return false;
 to.normalize();
 return to.dot(f)>=minDot;
}
function dragonUnderCrosshair(){return dragonCone(8,0.8);}
function hitDragon(){
 if(!dragonCone(8,0.8))return false;
 var dmg=4;
 if(typeof getSelectedItemId==='function'){var sw=getSelectedItemId();if(sw===117)dmg=12;else if(sw===116)dmg=8;}
 dragon.hp-=dmg;dragon.hurtT=0.3;
 burst(dragon.g.position.x-0.5,dragon.g.position.y-1,dragon.g.position.z-0.5,0xb24bf3);
 blip(120,55,0.12,0.14);
 updateBossbar();
 if(dragon.hp<=0)dragonDie();
 return true;
}
function dragonDie(){
 dragon.alive=false;
 if(dragon.g)dragon.g.visible=false;
 WMETA.dragonSlain=true;
 try{localStorage.setItem('voxelcraft_meta_v1',JSON.stringify(WMETA));}catch(e){}
 var gx=dragon.g.position;
 for(var i=0;i<6;i++)burst(gx.x+(Math.random()*6-3),gx.y+(Math.random()*4-2),gx.z+(Math.random()*6-3),i%2?0xb24bf3:0xe8d5ff);
 blip(200,30,0.9,0.2);
 var ey=findGroundY(END_CX,END_CZ);
 setBlock(END_CX,ey,END_CZ,DRAGON_EGG);
 updateBossbar();
 if(typeof addChatMsg==='function')addChatMsg('The Ender Dragon has fallen. Its egg rests at the island heart.','sys');
 state='victory';
 if(typeof suppressNextUnlockPause==='function')suppressNextUnlockPause();
 try{document.exitPointerLock();}catch(e){}
 var v=document.getElementById('victory');if(v)v.style.display='flex';
}
// ---------- travel ----------
var endReturn=null;
function endTeleport(){
 if(state!=='play')return;
 if(!inEnd()){
  endReturn={x:P.x,y:P.y,z:P.z};
  var scx=Math.floor((END_CX-45)/CH),scz=Math.floor(END_CZ/CH);
  for(var i=scx-2;i<=scx+2;i++)for(var j=scz-2;j<=scz+2;j++){if(!chunks.has(ck(i,j)))genChunk(i,j);}
  P.x=END_CX-44.5;P.z=END_CZ+0.5;P.y=32.02;P.vx=P.vy=P.vz=0;
  if(!WMETA.dragonSlain)spawnDragon();else if(typeof addChatMsg==='function')addChatMsg('The End is at peace.','sys');
  if(typeof addChatMsg==='function')addChatMsg(WMETA.dragonSlain?'Welcome back to the End.':'The End. Slay the dragon — /end to flee home.','sys');
  if(typeof toast==='function')toast('The End');
 }else{
  var r=endReturn||{x:SPAWNX,y:spawnY,z:SPAWNZ};
  P.x=r.x;P.y=r.y+0.4;P.z=r.z;P.vx=P.vy=P.vz=0;
  if(typeof addChatMsg==='function')addChatMsg('Returned to the overworld.','sys');
 }
 updateBossbar();
}
function endVoid(){
 if(gamemode==='survival'&&typeof damagePlayer==='function'){damagePlayer(999,'Fell into the void');}
 else{P.x=END_CX-44.5;P.z=END_CZ+0.5;P.y=32.02;P.vx=P.vy=P.vz=0;if(typeof toast==='function')toast('The void released you');}
}
(function(){
 var vb=document.getElementById('victoryBtn');
 if(vb)vb.addEventListener('click',function(){
  var v=document.getElementById('victory');if(v)v.style.display='none';
  state='play';if(typeof tryLock==='function')tryLock();
 });
})();
