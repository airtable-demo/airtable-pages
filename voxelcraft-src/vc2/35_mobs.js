// MODULE 35: mobs - pigs/sheep/cows/chickens (day) + zombies (night), physics, melee (OWNER: Fauna3)
// CONTRACT: top-level = function declarations + plain data only. All THREE/scene work happens
// lazily inside initMobs()/spawn functions, which run at runtime once state==='play' frames start.

// ===== CONSTANTS (plain data only) =====
var MOB_PIG=1, MOB_ZOMBIE=2, MOB_SHEEP=3, MOB_COW=4, MOB_CHICKEN=5;
var MOB_GRAV=26;

// Passive cap / range (combined pool for all passive types)
var PASSIVE_CAP=14, PASSIVE_CAP_RADIUS=75;
var PASSIVE_RANGE_MIN=14, PASSIVE_RANGE_MAX=40;
var PASSIVE_DESPAWN_RADIUS=90;

// Legacy pig constants kept for backwards compat
var PIG_CAP=8, PIG_CAP_RADIUS=60, PIG_RANGE_MIN=18, PIG_RANGE_MAX=45;
var ZOMBIE_CAP=6, ZOMBIE_CAP_RADIUS=70, ZOMBIE_RANGE_MIN=20, ZOMBIE_RANGE_MAX=40, ZOMBIE_CHASE_DIST=20;
var PIG_HP=6, ZOMBIE_HP=12;
var PIG_SPEED=1.6, ZOMBIE_CHASE_SPEED=2.5, ZOMBIE_WANDER_SPEED=1.1;
var MOB_AI_CULL_DIST=70;

// Updated hit constants (widened cone/range per brief)
var HIT_RANGE=4.0, HIT_DOT_MIN=0.88, HIT_DMG=4, HIT_KNOCK=7, HIT_KNOCK_VY=4.5;
var ZOMBIE_CONTACT_DIST=1.3, ZOMBIE_CONTACT_DY=2, ZOMBIE_CONTACT_DMG=2, ZOMBIE_CONTACT_CD=1.0;
var ZOMBIE_KNOCK_H=6, ZOMBIE_KNOCK_VY=4;
var ZOMBIE_DESPAWN_T=2.0;

// ===== SPECIES CONFIG TABLE =====
// color: main body hex
// colorB: secondary/accent hex (optional, 0 = none)
// speed: wander speed
// hp: max hit points
// soundF0/F1/dur/vol: blip params for ambient sound
// soundInterval: avg seconds between sounds
// dropItem: item id dropped on kill (survival)
// dropMin/dropMax: quantity range
// burstColor: particle hex on hit
// eyeOffset: {x,y,z} relative to group origin for hit-centre approximation
var SPECIES={};

// Populated at runtime (inside initMobs) to avoid hoisting issues with numeric refs
// but the table structure is defined here as plain data via a function.
function buildSpeciesTable(){
 SPECIES[MOB_PIG]={
  name:'pig',
  color:0xe89d9d, colorB:0,
  speed:1.6, hp:6,
  soundF0:340, soundF1:260, soundDur:0.08, soundVol:0.05,
  soundInterval:7,
  dropItem:101, dropMin:1, dropMax:2, // PORKCHOP
  burstColor:0xe89d9d,
  eyeOffsetY:0.42
 };
 SPECIES[MOB_SHEEP]={
  name:'sheep',
  color:0xd8d8d8, colorB:0x888888, // white body, gray face
  speed:1.5, hp:6,
  soundF0:300, soundF1:240, soundDur:0.14, soundVol:0.06,
  soundInterval:8,
  dropItem:27, dropMin:1, dropMax:2, // WOOL
  burstColor:0xd8d8d8,
  eyeOffsetY:0.52
 };
 SPECIES[MOB_COW]={
  name:'cow',
  color:0x5c3d1a, colorB:0xd8c8a0, // brown body, lighter patches
  speed:1.3, hp:8,
  soundF0:180, soundF1:120, soundDur:0.22, soundVol:0.07,
  soundInterval:10,
  dropItem:103, dropMin:1, dropMax:2, // BEEF
  burstColor:0x5c3d1a,
  eyeOffsetY:0.65
 };
 SPECIES[MOB_CHICKEN]={
  name:'chicken',
  color:0xf0f0f0, colorB:0xffcc00, // white body, yellow beak
  speed:1.8, hp:3,
  soundF0:500, soundF1:420, soundDur:0.06, soundVol:0.05,
  soundInterval:5,
  dropItem:104, dropMin:1, dropMax:1, // CHICKEN_MEAT
  burstColor:0xf0f0f0,
  eyeOffsetY:0.25
 };
}

// ===== STATE (plain data; populated lazily) =====
var mobsInited=false;
var MOBS=[];
var mobGeo=null;
var mobMat=null;
var mobClock=0;

// ===== LAZY INIT =====
function initMobs(){
 if(mobsInited)return;
 mobsInited=true;
 buildSpeciesTable();
 mobGeo={
  // Pig
  pigBody:new THREE.BoxGeometry(0.9,0.55,0.55),
  pigHead:new THREE.BoxGeometry(0.42,0.4,0.4),
  pigSnout:new THREE.BoxGeometry(0.18,0.16,0.12),
  pigLeg:new THREE.BoxGeometry(0.16,0.4,0.16),
  pigEye:new THREE.BoxGeometry(0.05,0.05,0.05),
  // Sheep (slightly bigger body, gray face box)
  sheepBody:new THREE.BoxGeometry(1.0,0.65,0.65),
  sheepHead:new THREE.BoxGeometry(0.38,0.38,0.38),
  sheepLeg:new THREE.BoxGeometry(0.15,0.44,0.15),
  sheepEye:new THREE.BoxGeometry(0.05,0.05,0.05),
  // Cow (bigger, patches)
  cowBody:new THREE.BoxGeometry(1.05,0.70,0.70),
  cowHead:new THREE.BoxGeometry(0.45,0.44,0.44),
  cowPatch:new THREE.BoxGeometry(0.28,0.28,0.08), // decorative white patch
  cowHorn:new THREE.BoxGeometry(0.07,0.18,0.07),
  cowLeg:new THREE.BoxGeometry(0.18,0.50,0.18),
  cowEye:new THREE.BoxGeometry(0.05,0.05,0.05),
  // Chicken (small 0.5 scale body)
  chickenBody:new THREE.BoxGeometry(0.4,0.35,0.35),
  chickenHead:new THREE.BoxGeometry(0.22,0.22,0.22),
  chickenBeak:new THREE.BoxGeometry(0.08,0.06,0.10),
  chickenLeg:new THREE.BoxGeometry(0.06,0.24,0.06),
  chickenEye:new THREE.BoxGeometry(0.04,0.04,0.04),
  // Zombie
  zomBody:new THREE.BoxGeometry(0.5,0.75,0.3),
  zomHead:new THREE.BoxGeometry(0.42,0.42,0.42),
  zomArm:new THREE.BoxGeometry(0.16,0.62,0.16),
  zomLeg:new THREE.BoxGeometry(0.18,0.62,0.18),
  zomEye:new THREE.BoxGeometry(0.05,0.05,0.05)
 };
 mobMat={
  pigBody:new THREE.MeshLambertMaterial({color:0xe89d9d}),
  pigSnout:new THREE.MeshLambertMaterial({color:0xc47575}),
  sheepBody:new THREE.MeshLambertMaterial({color:0xd8d8d8}),
  sheepFace:new THREE.MeshLambertMaterial({color:0x888888}),
  cowBody:new THREE.MeshLambertMaterial({color:0x5c3d1a}),
  cowPatch:new THREE.MeshLambertMaterial({color:0xd8c8a0}),
  chickenBody:new THREE.MeshLambertMaterial({color:0xf0f0f0}),
  chickenBeak:new THREE.MeshLambertMaterial({color:0xffcc00}),
  zomBody:new THREE.MeshLambertMaterial({color:0x5d8f57}),
  zomHead:new THREE.MeshLambertMaterial({color:0x3f6b3a}),
  eye:new THREE.MeshBasicMaterial({color:0x111111})
 };
}

// ===== MOB BODY BUILDERS =====
function buildPigModel(){
 var g=new THREE.Group();
 var body=new THREE.Mesh(mobGeo.pigBody,mobMat.pigBody);body.position.y=0.42;body.castShadow=false;body.receiveShadow=false;
 var head=new THREE.Mesh(mobGeo.pigHead,mobMat.pigBody);head.position.set(0,0.46,-0.48);
 var snout=new THREE.Mesh(mobGeo.pigSnout,mobMat.pigSnout);snout.position.set(0,0.42,-0.68);
 var eyeL=new THREE.Mesh(mobGeo.pigEye,mobMat.eye);eyeL.position.set(0.13,0.54,-0.66);
 var eyeR=new THREE.Mesh(mobGeo.pigEye,mobMat.eye);eyeR.position.set(-0.13,0.54,-0.66);
 body.frustumCulled=true;head.frustumCulled=true;snout.frustumCulled=true;eyeL.frustumCulled=true;eyeR.frustumCulled=true;
 g.add(body,head,snout,eyeL,eyeR);
 var legs=[];
 var legPos=[[0.28,0,-0.18],[-0.28,0,-0.18],[0.28,0,0.18],[-0.28,0,0.18]];
 for(var i=0;i<4;i++){
  var leg=new THREE.Mesh(mobGeo.pigLeg,mobMat.pigBody);
  leg.position.set(legPos[i][0],0.2,legPos[i][1]);
  leg.frustumCulled=true;
  g.add(leg);legs.push(leg);
 }
 return {group:g,body:body,head:head,legs:legs,parts:[body,head,snout,eyeL,eyeR].concat(legs)};
}

function buildSheepModel(){
 var g=new THREE.Group();
 var body=new THREE.Mesh(mobGeo.sheepBody,mobMat.sheepBody);body.position.y=0.52;body.castShadow=false;body.receiveShadow=false;
 var head=new THREE.Mesh(mobGeo.sheepHead,mobMat.sheepFace);head.position.set(0,0.58,-0.54);
 var eyeL=new THREE.Mesh(mobGeo.sheepEye,mobMat.eye);eyeL.position.set(0.14,0.62,-0.73);
 var eyeR=new THREE.Mesh(mobGeo.sheepEye,mobMat.eye);eyeR.position.set(-0.14,0.62,-0.73);
 body.frustumCulled=true;head.frustumCulled=true;eyeL.frustumCulled=true;eyeR.frustumCulled=true;
 g.add(body,head,eyeL,eyeR);
 var legs=[];
 var legPos=[[0.30,0,-0.22],[-0.30,0,-0.22],[0.30,0,0.22],[-0.30,0,0.22]];
 for(var i=0;i<4;i++){
  var leg=new THREE.Mesh(mobGeo.sheepLeg,mobMat.sheepFace);
  leg.position.set(legPos[i][0],0.22,legPos[i][1]);
  leg.frustumCulled=true;
  g.add(leg);legs.push(leg);
 }
 return {group:g,body:body,head:head,legs:legs,parts:[body,head,eyeL,eyeR].concat(legs)};
}

function buildCowModel(){
 var g=new THREE.Group();
 var body=new THREE.Mesh(mobGeo.cowBody,mobMat.cowBody);body.position.y=0.65;body.castShadow=false;body.receiveShadow=false;
 var head=new THREE.Mesh(mobGeo.cowHead,mobMat.cowBody);head.position.set(0,0.72,-0.60);
 // white patch on body
 var patch=new THREE.Mesh(mobGeo.cowPatch,mobMat.cowPatch);patch.position.set(0,0.70,0.35);
 // simple horns
 var hornL=new THREE.Mesh(mobGeo.cowHorn,mobMat.cowPatch);hornL.position.set(0.18,0.92,-0.60);
 var hornR=new THREE.Mesh(mobGeo.cowHorn,mobMat.cowPatch);hornR.position.set(-0.18,0.92,-0.60);
 var eyeL=new THREE.Mesh(mobGeo.cowEye,mobMat.eye);eyeL.position.set(0.17,0.74,-0.82);
 var eyeR=new THREE.Mesh(mobGeo.cowEye,mobMat.eye);eyeR.position.set(-0.17,0.74,-0.82);
 body.frustumCulled=true;head.frustumCulled=true;patch.frustumCulled=true;
 hornL.frustumCulled=true;hornR.frustumCulled=true;eyeL.frustumCulled=true;eyeR.frustumCulled=true;
 g.add(body,head,patch,hornL,hornR,eyeL,eyeR);
 var legs=[];
 var legPos=[[0.32,0,-0.24],[-0.32,0,-0.24],[0.32,0,0.24],[-0.32,0,0.24]];
 for(var i=0;i<4;i++){
  var leg=new THREE.Mesh(mobGeo.cowLeg,mobMat.cowBody);
  leg.position.set(legPos[i][0],0.25,legPos[i][1]);
  leg.frustumCulled=true;
  g.add(leg);legs.push(leg);
 }
 return {group:g,body:body,head:head,legs:legs,parts:[body,head,patch,hornL,hornR,eyeL,eyeR].concat(legs)};
}

function buildChickenModel(){
 // Chicken is small - placed near ground
 var g=new THREE.Group();
 var body=new THREE.Mesh(mobGeo.chickenBody,mobMat.chickenBody);body.position.y=0.28;body.castShadow=false;body.receiveShadow=false;
 var head=new THREE.Mesh(mobGeo.chickenHead,mobMat.chickenBody);head.position.set(0,0.44,-0.26);
 var beak=new THREE.Mesh(mobGeo.chickenBeak,mobMat.chickenBeak);beak.position.set(0,0.42,-0.38);
 var eyeL=new THREE.Mesh(mobGeo.chickenEye,mobMat.eye);eyeL.position.set(0.09,0.48,-0.37);
 var eyeR=new THREE.Mesh(mobGeo.chickenEye,mobMat.eye);eyeR.position.set(-0.09,0.48,-0.37);
 body.frustumCulled=true;head.frustumCulled=true;beak.frustumCulled=true;eyeL.frustumCulled=true;eyeR.frustumCulled=true;
 g.add(body,head,beak,eyeL,eyeR);
 var legs=[];
 var legPos=[[0.10,0,-0.04],[-0.10,0,-0.04]];
 for(var i=0;i<2;i++){
  var leg=new THREE.Mesh(mobGeo.chickenLeg,mobMat.chickenBeak);
  leg.position.set(legPos[i][0],0.12,legPos[i][1]);
  leg.frustumCulled=true;
  g.add(leg);legs.push(leg);
 }
 return {group:g,body:body,head:head,legs:legs,bobHead:head,parts:[body,head,beak,eyeL,eyeR].concat(legs)};
}

function buildZombieModel(){
 var g=new THREE.Group();
 var body=new THREE.Mesh(mobGeo.zomBody,mobMat.zomBody);body.position.y=1.14;
 var head=new THREE.Mesh(mobGeo.zomHead,mobMat.zomHead);head.position.y=1.72;
 var eyeL=new THREE.Mesh(mobGeo.zomEye,mobMat.eye);eyeL.position.set(0.11,1.75,-0.2);
 var eyeR=new THREE.Mesh(mobGeo.zomEye,mobMat.eye);eyeR.position.set(-0.11,1.75,-0.2);
 body.frustumCulled=true;head.frustumCulled=true;eyeL.frustumCulled=true;eyeR.frustumCulled=true;
 g.add(body,head,eyeL,eyeR);
 var armL=new THREE.Mesh(mobGeo.zomArm,mobMat.zomHead);armL.position.set(0.32,1.12,0);
 var armR=new THREE.Mesh(mobGeo.zomArm,mobMat.zomHead);armR.position.set(-0.32,1.12,0);
 var legL=new THREE.Mesh(mobGeo.zomLeg,mobMat.zomBody);legL.position.set(0.14,0.31,0);
 var legR=new THREE.Mesh(mobGeo.zomLeg,mobMat.zomBody);legR.position.set(-0.14,0.31,0);
 armL.frustumCulled=true;armR.frustumCulled=true;legL.frustumCulled=true;legR.frustumCulled=true;
 g.add(armL,armR,legL,legR);
 return {group:g,body:body,head:head,legs:[legL,legR],arms:[armL,armR],parts:[body,head,eyeL,eyeR,armL,armR,legL,legR]};
}

// ===== HELPERS =====
function mobRand(m,salt){return h3(Math.floor(m.pos.x*4)+salt,Math.floor(mobClock*37)+salt*7,Math.floor(m.pos.z*4)+salt);}
function mobDistToPlayer(m){var dx=m.pos.x-P.x,dz=m.pos.z-P.z;return Math.sqrt(dx*dx+dz*dz);}
function mobFeetSolid(wx,wy,wz){return isSolid(getBlock(Math.floor(wx),Math.floor(wy),Math.floor(wz),AIR));}
function mobWaterAhead(wx,wy,wz){
 var b0=getBlock(Math.floor(wx),Math.floor(wy),Math.floor(wz),AIR);
 var b1=getBlock(Math.floor(wx),Math.floor(wy)+1,Math.floor(wz),AIR);
 return b0===WATER&&b1===WATER;
}
function countPassiveMobsNear(within){
 var c=0;
 for(var i=0;i<MOBS.length;i++){
  var m=MOBS[i];
  if(m.type===MOB_ZOMBIE||m.dying)continue;
  var dx=m.pos.x-P.x,dz=m.pos.z-P.z;
  if(dx*dx+dz*dz<within*within)c++;
 }
 return c;
}
function countMobsNear(type,within){
 var c=0;
 for(var i=0;i<MOBS.length;i++){
  var m=MOBS[i];if(m.type!==type||m.dying)continue;
  var dx=m.pos.x-P.x,dz=m.pos.z-P.z;
  if(dx*dx+dz*dz<within*within)c++;
 }
 return c;
}
function isPassiveGroundOk(groundId,type){
 // chickens also spawn on SAND; all others need GRASS or SNOWGRASS
 if(groundId===GRASS||groundId===13)return true; // SNOWGRASS=13
 if(type===MOB_CHICKEN&&groundId===SAND)return true;
 return false;
}

// ===== SPAWNING =====
function spawnAttemptPos(minR,maxR){
 var ang=Math.random()*Math.PI*2;
 var r=minR+Math.random()*(maxR-minR);
 var wx=Math.floor(P.x+Math.cos(ang)*r);
 var wz=Math.floor(P.z+Math.sin(ang)*r);
 return {wx:wx,wz:wz};
}

function spawnPassive(){
 if(typeof P==='undefined')return;
 if(countPassiveMobsNear(PASSIVE_CAP_RADIUS)>=PASSIVE_CAP)return;
 var pos=spawnAttemptPos(PASSIVE_RANGE_MIN,PASSIVE_RANGE_MAX);
 var gy=findGroundY(pos.wx,pos.wz);
 var groundId=getBlock(pos.wx,gy-1,pos.wz,AIR);
 if(gy<SEA)return;
 // Pick species randomly; chickens slightly more common (weight 2 vs 1 each)
 // weights: pig=1, sheep=1, cow=1, chicken=2 => total 5
 var roll=Math.random()*5;
 var type;
 if(roll<1)type=MOB_PIG;
 else if(roll<2)type=MOB_SHEEP;
 else if(roll<3)type=MOB_COW;
 else type=MOB_CHICKEN;
 if(!isPassiveGroundOk(groundId,type))return;
 var model;
 if(type===MOB_PIG)model=buildPigModel();
 else if(type===MOB_SHEEP)model=buildSheepModel();
 else if(type===MOB_COW)model=buildCowModel();
 else model=buildChickenModel();
 model.group.position.set(pos.wx+0.5,gy,pos.wz+0.5);
 scene.add(model.group);
 var sp=SPECIES[type];
 MOBS.push({
  type:type,group:model.group,parts:model.parts,legs:model.legs,
  bobHead:model.bobHead||null,
  pos:{x:pos.wx+0.5,y:gy,z:pos.wz+0.5},vel:{x:0,y:0,z:0},
  yaw:Math.random()*Math.PI*2,targetYaw:0,
  hp:sp.hp,maxHp:sp.hp,hurtT:0,dying:false,despawnT:0,
  aiT:1+Math.random()*2,wanderTx:pos.wx+0.5,wanderTz:pos.wz+0.5,idle:false,idleT:0,
  soundT:2+Math.random()*sp.soundInterval,grounded:false,walkPhase:Math.random()*10
 });
}

// Legacy: spawnPig kept for backwards compat
function spawnPig(){
 spawnPassive();
}

function spawnZombie(){
 if(typeof P==='undefined')return;
 if(!isNight())return;
 if(countMobsNear(MOB_ZOMBIE,ZOMBIE_CAP_RADIUS)>=ZOMBIE_CAP)return;
 var pos=spawnAttemptPos(ZOMBIE_RANGE_MIN,ZOMBIE_RANGE_MAX);
 var gy=findGroundY(pos.wx,pos.wz);
 var groundId=getBlock(pos.wx,gy-1,pos.wz,AIR);
 if(!isSolid(groundId)||groundId===WATER)return;
 if(gy<SEA)return;
 var model=buildZombieModel();
 model.group.position.set(pos.wx+0.5,gy,pos.wz+0.5);
 scene.add(model.group);
 MOBS.push({
  type:MOB_ZOMBIE,group:model.group,parts:model.parts,legs:model.legs,arms:model.arms,
  bobHead:null,
  pos:{x:pos.wx+0.5,y:gy,z:pos.wz+0.5},vel:{x:0,y:0,z:0},
  yaw:Math.random()*Math.PI*2,targetYaw:0,
  hp:ZOMBIE_HP,maxHp:ZOMBIE_HP,hurtT:0,dying:false,despawnT:0,
  aiT:1+Math.random()*2,wanderTx:pos.wx+0.5,wanderTz:pos.wz+0.5,idle:false,idleT:0,
  soundT:2+Math.random()*6,grounded:false,walkPhase:Math.random()*10,contactCd:0
 });
}

// ===== PHYSICS =====
function mobTryAxis(m,tx,tz){
 var testFeet=Math.floor(m.pos.y+0.05);
 if(!mobFeetSolid(tx,testFeet,tz))return {x:tx,z:tz,dy:0};
 if(!mobFeetSolid(tx,testFeet+1,tz)&&testFeet+1<WH){
  return {x:tx,z:tz,dy:1};
 }
 return null;
}
function mobPhysicsStep(m,dt,wishX,wishZ,speed){
 var k=Math.min(1,10*dt);
 m.vel.x+=(wishX*speed-m.vel.x)*k;
 m.vel.z+=(wishZ*speed-m.vel.z)*k;
 m.vel.y-=MOB_GRAV*dt;
 if(m.vel.y<-40)m.vel.y=-40;

 var nx=m.pos.x+m.vel.x*dt;
 var nz=m.pos.z+m.vel.z*dt;
 var ny=m.pos.y+m.vel.y*dt;

 if(mobWaterAhead(nx,m.pos.y,m.pos.z)){nx=m.pos.x;m.vel.x=0;}
 if(mobWaterAhead(m.pos.x,m.pos.y,nz)){nz=m.pos.z;m.vel.z=0;}

 m.grounded=false;
 var stepUp=0;

 var rx=mobTryAxis(m,nx,m.pos.z);
 if(rx){m.pos.x=rx.x;if(rx.dy>0)stepUp=Math.max(stepUp,rx.dy);}
 else{m.vel.x=0;}
 var rz=mobTryAxis(m,m.pos.x,nz);
 if(rz){m.pos.z=rz.z;if(rz.dy>0)stepUp=Math.max(stepUp,rz.dy);}
 else{m.vel.z=0;}

 var feetY=Math.floor(ny);
 if(mobFeetSolid(m.pos.x,feetY,m.pos.z)&&m.vel.y<=0){
  ny=feetY+1;m.vel.y=0;m.grounded=true;
 }
 if(stepUp>0){ny=Math.max(ny,Math.floor(m.pos.y)+1+0.001);m.grounded=true;if(m.vel.y<0)m.vel.y=0;}
 if(m.vel.y>0&&isSolid(getBlock(Math.floor(m.pos.x),Math.floor(ny+1.6),Math.floor(m.pos.z),AIR))){
  ny=Math.floor(ny+1.6)-1.6-0.01;m.vel.y=0;
 }

 m.pos.y=ny;
}

// ===== GENERIC PASSIVE AI (reused for pig/sheep/cow/chicken) =====
function aiPassive(m,dt,farAI){
 var sp=SPECIES[m.type];
 if(m.hurtT>0)m.hurtT-=dt;
 m.soundT-=dt;
 if(m.soundT<=0){
  m.soundT=sp.soundInterval*0.5+mobRand(m,3)*sp.soundInterval;
  if(typeof blip==='function')blip(sp.soundF0,sp.soundF1,sp.soundDur,sp.soundVol);
 }
 if(farAI)return {wishX:0,wishZ:0,speed:0};
 m.aiT-=dt;
 if(m.aiT<=0){
  if(m.idle){
   m.idle=false;
   var ang=Math.random()*Math.PI*2,r=2+Math.random()*5;
   m.wanderTx=m.pos.x+Math.cos(ang)*r;
   m.wanderTz=m.pos.z+Math.sin(ang)*r;
   m.aiT=3+Math.random()*5;
  } else {
   m.idle=true;
   m.aiT=1+Math.random()*2.5;
  }
 }
 if(m.idle)return {wishX:0,wishZ:0,speed:0};
 var dx=m.wanderTx-m.pos.x,dz=m.wanderTz-m.pos.z;
 var d=Math.sqrt(dx*dx+dz*dz);
 if(d<0.4)return {wishX:0,wishZ:0,speed:0};
 m.targetYaw=Math.atan2(dx,dz);
 return {wishX:dx/d,wishZ:dz/d,speed:sp.speed};
}

// Legacy aiPig kept for backwards compat
function aiPig(m,dt,farAI){
 return aiPassive(m,dt,farAI);
}

// ===== AI: ZOMBIE =====
function aiZombie(m,dt,farAI){
 if(m.hurtT>0)m.hurtT-=dt;
 if(m.contactCd>0)m.contactCd-=dt;
 m.soundT-=dt;
 if(m.soundT<=0){
  m.soundT=5+mobRand(m,11)*9;
  if(typeof blip==='function')blip(120,70,0.25,0.06);
 }
 if(farAI)return {wishX:0,wishZ:0,speed:0};
 var dist=mobDistToPlayer(m);
 if(dist<ZOMBIE_CHASE_DIST&&typeof P!=='undefined'){
  var dx=P.x-m.pos.x,dz=P.z-m.pos.z;
  var d=Math.sqrt(dx*dx+dz*dz);
  if(d>0.05){
   m.targetYaw=Math.atan2(dx,dz);
   var dy=Math.abs(P.y-m.pos.y);
   if(d<ZOMBIE_CONTACT_DIST&&dy<ZOMBIE_CONTACT_DY&&m.contactCd<=0){
    m.contactCd=ZOMBIE_CONTACT_CD;
    if(typeof damagePlayer==='function')damagePlayer(ZOMBIE_CONTACT_DMG,'Slain by a zombie');
    var kdx=dx/d,kdz=dz/d;
    P.vx+=kdx*ZOMBIE_KNOCK_H;P.vy=Math.max(P.vy,ZOMBIE_KNOCK_VY);P.vz+=kdz*ZOMBIE_KNOCK_H;
   }
   return {wishX:dx/d,wishZ:dz/d,speed:ZOMBIE_CHASE_SPEED};
  }
  return {wishX:0,wishZ:0,speed:0};
 }
 m.aiT-=dt;
 if(m.aiT<=0){
  if(m.idle){m.idle=false;var ang2=Math.random()*Math.PI*2,r2=2+Math.random()*4;
   m.wanderTx=m.pos.x+Math.cos(ang2)*r2;m.wanderTz=m.pos.z+Math.sin(ang2)*r2;m.aiT=3+Math.random()*4;
  }else{m.idle=true;m.aiT=1.5+Math.random()*2;}
 }
 if(m.idle)return {wishX:0,wishZ:0,speed:0};
 var wdx=m.wanderTx-m.pos.x,wdz=m.wanderTz-m.pos.z;
 var wd=Math.sqrt(wdx*wdx+wdz*wdz);
 if(wd<0.4)return {wishX:0,wishZ:0,speed:0};
 m.targetYaw=Math.atan2(wdx,wdz);
 return {wishX:wdx/wd,wishZ:wdz/wd,speed:ZOMBIE_WANDER_SPEED};
}

// ===== VISUAL SYNC =====
function mobSyncVisual(m,dt){
 var diff=m.targetYaw-m.yaw;
 while(diff>Math.PI)diff-=Math.PI*2;
 while(diff<-Math.PI)diff+=Math.PI*2;
 m.yaw+=diff*Math.min(1,8*dt);

 m.group.position.set(m.pos.x,m.pos.y,m.pos.z);
 m.group.rotation.y=m.yaw;

 var hsp=Math.sqrt(m.vel.x*m.vel.x+m.vel.z*m.vel.z);
 if(hsp>0.15){
  m.walkPhase+=hsp*dt*4.2;
 } else {
  m.walkPhase*=Math.pow(0.001,dt);
 }
 var swing=Math.sin(m.walkPhase)*0.55;
 if(m.legs){
  for(var i=0;i<m.legs.length;i++){
   var s=(i%2===0)?swing:-swing;
   m.legs[i].rotation.x=s;
  }
 }
 if(m.arms){
  for(var j=0;j<m.arms.length;j++){
   var sa=(j%2===0)?-swing:swing;
   m.arms[j].rotation.x=sa*0.7;
  }
 }
 // Chicken bob: slight head dip on walk
 if(m.bobHead){
  m.bobHead.position.y=0.44+Math.sin(m.walkPhase*2)*0.04;
 }

 if(m.hurtT>0){
  var sc=1+Math.sin(m.hurtT*40)*0.08;
  m.group.scale.set(sc,sc,sc);
 } else {
  m.group.scale.set(1,1,1);
 }
}

// ===== DEATH / DESPAWN =====
function mobDie(m){
 var sp=SPECIES[m.type];
 var bc=sp?sp.burstColor:(m.type===MOB_ZOMBIE?0x3f6b3a:0xe89d9d);
 if(typeof burst==='function')burst(Math.floor(m.pos.x),Math.floor(m.pos.y),Math.floor(m.pos.z),bc);
 mobRemove(m);
}
function mobRemove(m){
 scene.remove(m.group);
 var idx=MOBS.indexOf(m);
 if(idx>=0)MOBS.splice(idx,1);
}

// ===== DROP HELPER =====
function mobDrops(m){
 var sp=SPECIES[m.type];
 if(!sp)return;
 if(typeof gamemode==='undefined'||gamemode!=='survival')return;
 if(typeof invAdd!=='function')return;
 var qty=sp.dropMin+(Math.random()<0.5&&sp.dropMax>sp.dropMin?1:0);
 if(typeof spawnDrop==='function'&&m.pos)spawnDrop(Math.floor(m.pos.x),Math.floor(m.pos.y),Math.floor(m.pos.z),sp.dropItem,qty);
 else invAdd(sp.dropItem,qty);
 var label='+ ';
 if(sp.dropItem===101)label+='Porkchop';
 else if(sp.dropItem===27)label+='Wool';
 else if(sp.dropItem===103)label+='Beef';
 else if(sp.dropItem===104)label+='Chicken';
 else label+=sp.name;
 if(typeof toast==='function')toast(label);
}

// ===== CROSSHAIR MOB TEST (cheap, no allocs, no side effects) =====
function mobUnderCrosshair(){
 if(!mobsInited||typeof camera==='undefined')return false;
 var camPos=camera.position;
 var fwd=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
 for(var i=0;i<MOBS.length;i++){
  var m=MOBS[i];
  if(m.dying)continue;
  var sp=SPECIES[m.type];
  var eyeY=sp?sp.eyeOffsetY:0.42;
  var dx=m.pos.x-camPos.x,dy=(m.pos.y+eyeY)-camPos.y,dz=m.pos.z-camPos.z;
  var d=Math.sqrt(dx*dx+dy*dy+dz*dz);
  if(d>HIT_RANGE)continue;
  if(d<0.0001)return true;
  var dot=(dx*fwd.x+dy*fwd.y+dz*fwd.z)/d;
  if(dot>=HIT_DOT_MIN)return true;
 }
 return false;
}

// ===== MAIN UPDATE =====
var mobSpawnT=0;
function updateMobs(dt){
 if(!mobsInited)initMobs();
 if(typeof P==='undefined'||typeof scene==='undefined')return;
 mobClock+=dt;

 mobSpawnT-=dt;
 if(mobSpawnT<=0){
  mobSpawnT=1.2+Math.random()*1.0;
  if(!isNight())spawnPassive();
  else spawnZombie();
 }

 for(var i=MOBS.length-1;i>=0;i--){
  var m=MOBS[i];

  // Despawn passive mobs that roamed too far
  if(m.type!==MOB_ZOMBIE&&!m.dying){
   var ddx=m.pos.x-P.x,ddz=m.pos.z-P.z;
   if(ddx*ddx+ddz*ddz>PASSIVE_DESPAWN_RADIUS*PASSIVE_DESPAWN_RADIUS){
    mobRemove(m);continue;
   }
  }

  // Dawn despawn for zombies
  if(m.type===MOB_ZOMBIE&&!isNight()&&!m.dying){
   m.dying=true;m.despawnT=ZOMBIE_DESPAWN_T;
  }
  if(m.dying){
   m.despawnT-=dt;
   var t=Math.max(0,m.despawnT/ZOMBIE_DESPAWN_T);
   m.group.scale.set(t,t,t);
   if(m.despawnT<=0){
    if(typeof burst==='function')burst(Math.floor(m.pos.x),Math.floor(m.pos.y),Math.floor(m.pos.z),0x3f6b3a);
    mobRemove(m);
   }
   continue;
  }

  if(m.pos.y<-10){mobRemove(m);continue;}

  var dist=mobDistToPlayer(m);
  var farAI=dist>MOB_AI_CULL_DIST;

  var wish;
  if(m.type===MOB_ZOMBIE)wish=aiZombie(m,dt,farAI);
  else wish=aiPassive(m,dt,farAI);

  if(farAI){
   mobPhysicsStep(m,dt,0,0,0);
  } else {
   mobPhysicsStep(m,dt,wish.wishX,wish.wishZ,wish.speed);
  }

  mobSyncVisual(m,dt);
 }
}

// ===== MELEE: hitMob() =====
function hitMob(){
 if(!mobsInited||typeof camera==='undefined')return false;
 var camPos=camera.position;
 var fwd=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
 var best=null,bestD=HIT_RANGE+1;
 for(var i=0;i<MOBS.length;i++){
  var m=MOBS[i];
  if(m.dying)continue;
  var sp=SPECIES[m.type];
  var eyeY=sp?sp.eyeOffsetY:0.42;
  var dx=m.pos.x-camPos.x,dy=(m.pos.y+eyeY)-camPos.y,dz=m.pos.z-camPos.z;
  var d=Math.sqrt(dx*dx+dy*dy+dz*dz);
  if(d>HIT_RANGE)continue;
  var dot=(d>0.0001)?((dx*fwd.x+dy*fwd.y+dz*fwd.z)/d):1;
  if(dot<HIT_DOT_MIN)continue;
  if(d<bestD){bestD=d;best=m;}
 }
 if(!best)return false;

 var selW=(typeof getSelectedItemId==='function')?getSelectedItemId():null;
 var isSword=(selW===116||selW===117);
 var dmg=(selW===117)?12:(selW===116?8:HIT_DMG);
 var knockMul=isSword?1.3:1;

 best.hp-=dmg;
 best.hurtT=0.28;

 // Knockback away from player
 var kdx=best.pos.x-P.x,kdz=best.pos.z-P.z;
 var kd=Math.sqrt(kdx*kdx+kdz*kdz);
 if(kd<0.001){kdx=Math.sin(best.yaw);kdz=Math.cos(best.yaw);kd=1;}
 best.vel.x+=(kdx/kd)*HIT_KNOCK*knockMul;
 best.vel.z+=(kdz/kd)*HIT_KNOCK*knockMul;
 best.vel.y=HIT_KNOCK_VY;

 // Per-hit feedback: blip + burst at mob
 if(typeof blip==='function')blip(200,120,0.08,0.12);
 var spHit=SPECIES[best.type];
 var hitColor=spHit?spHit.burstColor:0xff8888;
 if(typeof burst==='function')burst(Math.floor(best.pos.x),Math.floor(best.pos.y+0.5),Math.floor(best.pos.z),hitColor);

 if(best.hp<=0){
  // Bigger burst on kill
  if(typeof burst==='function'){
   burst(Math.floor(best.pos.x),Math.floor(best.pos.y),Math.floor(best.pos.z),hitColor);
   burst(Math.floor(best.pos.x),Math.floor(best.pos.y+1),Math.floor(best.pos.z),hitColor);
  }
  // Drops + toast (survival only)
  if(best.type!==MOB_ZOMBIE)mobDrops(best);
  else if(typeof gamemode!=='undefined'&&gamemode==='survival'&&typeof invAdd==='function'){
   // Zombies drop nothing currently, but keep the hook
  }
  mobDie(best);
 }
 return true;
}
