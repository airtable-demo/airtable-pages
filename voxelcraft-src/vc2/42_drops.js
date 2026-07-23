
// ---------- 42_drops.js: item-drop entities (pop, bounce, spin, magnet, collect) ----------
var DROPS=[],dropMatCache={};
function dropVisual(id){
 var key=String(id);
 var mat=dropMatCache[key];
 if(!mat){
  var c=document.createElement('canvas');c.width=c.height=32;
  var g2=c.getContext('2d');g2.imageSmoothingEnabled=false;
  if(typeof drawSlotIcon==='function')drawSlotIcon(g2,id);
  var tex=new THREE.CanvasTexture(c);tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;
  mat=dropMatCache[key]=new THREE.MeshLambertMaterial({map:tex,transparent:true});
 }
 var isB=(typeof isBlockId!=='function')||isBlockId(id);
 var m;
 if(isB)m=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.26,0.26),mat);
 else{m=new THREE.Mesh(new THREE.PlaneGeometry(0.32,0.32),mat);mat.side=THREE.DoubleSide;}
 return m;
}
function spawnDrop(x,y,z,id,n){
 if(gamemode!=='survival')return;
 n=n||1;
 for(var i=0;i<n&&DROPS.length<120;i++){
  var m=dropVisual(id);
  m.position.set(x+0.5,y+0.45,z+0.5);
  scene.add(m);
  DROPS.push({id:id,m:m,vx:(Math.random()-0.5)*2.6,vy:2.6+Math.random()*1.8,vz:(Math.random()-0.5)*2.6,
   age:0,rest:false,restY:0});
 }
}
function updateDrops(dt){
 if(!DROPS.length)return;
 for(var i=DROPS.length-1;i>=0;i--){
  var d=DROPS[i];
  d.age+=dt;
  if(d.age>60){scene.remove(d.m);DROPS.splice(i,1);continue;}
  var p=d.m.position;
  // magnet + collect
  var dx=P.x-p.x,dy=(P.y+0.9)-p.y,dz=P.z-p.z;
  var dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
  if(dist<0.95){
   scene.remove(d.m);DROPS.splice(i,1);
   if(typeof invAdd==='function')invAdd(d.id,1);
   if(typeof refreshCounts==='function')refreshCounts();
   blip(520,760,0.06,0.07);
   continue;
  }
  if(dist<2.4&&d.age>0.45){
   var pull=Math.min(1,9*dt/Math.max(dist,0.05));
   p.x+=dx*pull;p.y+=dy*pull;p.z+=dz*pull;
   d.rest=false;
  }else if(!d.rest){
   d.vy-=17*dt;if(d.vy<-30)d.vy=-30;
   p.x+=d.vx*dt;p.y+=d.vy*dt;p.z+=d.vz*dt;
   var fy=Math.floor(p.y-0.14);
   if(d.vy<0&&isSolid(getBlock(Math.floor(p.x),fy,Math.floor(p.z),AIR))){
    var top=fy+1+0.14;
    if(p.y<=top){p.y=top;
     if(Math.abs(d.vy)>2.2){d.vy=-d.vy*0.35;d.vx*=0.6;d.vz*=0.6;}
     else{d.rest=true;d.restY=top;d.vx=d.vy=d.vz=0;}}
   }
   if(p.y<-14){scene.remove(d.m);DROPS.splice(i,1);continue;}
  }else{
   p.y=d.restY+0.045+Math.sin(d.age*2.6)*0.045;
  }
  d.m.rotation.y+=dt*2.4;
 }
}
