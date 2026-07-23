var VC_VERSION='3.0';
console.log('VOXELCRAFT v'+VC_VERSION);
window.addEventListener('error',function(ev){try{if(typeof toast==='function')toast('Error: '+(ev.message||'').slice(0,90));}catch(x){}});
// MODULE 20: renderer/sky/audio/particles (OWNER: core)
// ===== THREE SETUP =====

var canvas=document.getElementById('c');
var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.outputEncoding=THREE.sRGBEncoding;
var scene=new THREE.Scene();
var camera=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,.08,500);
addEventListener('resize',function(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
var atlas=new THREE.CanvasTexture(atlasC);
atlas.magFilter=THREE.NearestFilter;atlas.minFilter=THREE.NearestFilter;atlas.generateMipmaps=false;atlas.encoding=THREE.sRGBEncoding;
var matO=new THREE.MeshLambertMaterial({map:atlas,vertexColors:true});
var matT=new THREE.MeshLambertMaterial({map:atlas,vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide});
var amb=new THREE.AmbientLight(0xffffff,.65);scene.add(amb);
var hemi=new THREE.HemisphereLight(0xbdd8ff,0x54492e,.35);scene.add(hemi);
var sun=new THREE.DirectionalLight(0xffffff,.9);scene.add(sun);scene.add(sun.target);
scene.fog=new THREE.Fog(0x9bbcf0,52,96);
// stars
var stars=(function(){var g=new THREE.BufferGeometry(),p=[];for(var i=0;i<700;i++){var t=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=380;
 p.push(r*Math.sin(ph)*Math.cos(t),Math.abs(r*Math.cos(ph)),r*Math.sin(ph)*Math.sin(t));}
 g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
 var m=new THREE.PointsMaterial({color:0xcfe0ff,size:1.4,sizeAttenuation:true,transparent:true,opacity:0,fog:false});
 var pts=new THREE.Points(g,m);scene.add(pts);return pts;})();
function discSprite(color,glow){var c=document.createElement('canvas');c.width=c.height=128;var g=c.getContext('2d');
 var gr=g.createRadialGradient(64,64,10,64,64,64);gr.addColorStop(0,color);gr.addColorStop(.55,glow);gr.addColorStop(1,'rgba(0,0,0,0)');
 g.fillStyle=gr;g.fillRect(0,0,128,128);
 var t=new THREE.CanvasTexture(c);var s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,fog:false}));return s;}
var sunS=discSprite('rgba(255,244,200,1)','rgba(255,214,120,0.55)');sunS.scale.set(46,46,1);scene.add(sunS);
var moonS=discSprite('rgba(220,230,255,0.95)','rgba(150,170,230,0.4)');moonS.scale.set(26,26,1);scene.add(moonS);
// clouds
var clouds=[];(function(){var m=new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:.42});
 for(var i=0;i<16;i++){var w=10+Math.random()*16,d=6+Math.random()*10;
 var c=new THREE.Mesh(new THREE.BoxGeometry(w,1.6,d),m);
 c.position.set((Math.random()-0.5)*280,68+Math.random()*7,(Math.random()-0.5)*280);scene.add(c);clouds.push(c);}})();

// ===== PARTICLES / AUDIO =====

var partGeo=new THREE.BoxGeometry(.13,.13,.13),parts=[],pmats={};
function burst(x,y,z,colHex){
 var m=pmats[colHex]||(pmats[colHex]=new THREE.MeshBasicMaterial({color:colHex}));
 for(var i=0;i<12;i++){
   var p=new THREE.Mesh(partGeo,m);
   p.position.set(x+.5,y+.5,z+.5);
   parts.push({m:p,vx:(Math.random()-.5)*5,vy:Math.random()*5+1,vz:(Math.random()-.5)*5,life:.6+Math.random()*.3});
   scene.add(p);}
}
function updParts(dt){for(var i=parts.length-1;i>=0;i--){var p=parts[i];p.life-=dt;
 if(p.life<=0){scene.remove(p.m);parts.splice(i,1);continue;}
 p.vy-=16*dt;p.m.position.x+=p.vx*dt;p.m.position.y+=p.vy*dt;p.m.position.z+=p.vz*dt;
 var s=Math.max(.2,p.life*1.6);p.m.scale.set(s,s,s);}}
var actx=null;
function blip(f0,f1,dur,vol){try{
 if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();
 var o=actx.createOscillator(),g=actx.createGain();
 o.type='square';o.frequency.setValueAtTime(f0,actx.currentTime);
 o.frequency.exponentialRampToValueAtTime(f1,actx.currentTime+dur);
 g.gain.setValueAtTime(vol,actx.currentTime);g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+dur);
 o.connect(g);g.connect(actx.destination);o.start();o.stop(actx.currentTime+dur);}catch(e){}}

// ===== DAY / NIGHT =====

var DAYLEN=240,tod=0.28;
function colLerp(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
var NIGHT=[0.015,0.03,0.08],DAY=[0.545,0.71,0.94],DUSK=[0.98,0.55,0.32];
var skyColor=new THREE.Color();
function updateSky(dt){
 tod=(tod+dt/DAYLEN)%1;
 if(typeof inEnd==='function'&&inEnd()){if(typeof endSky==='function'){endSky();return;}}
 else if(sunS.visible===false){sunS.visible=true;moonS.visible=true;}
 var th=tod*Math.PI*2,sh=Math.sin(th);
 var k=Math.max(0,Math.min(1,(sh+0.15)*2.4));skyK=k;
 var w=Math.max(0,1-Math.abs(sh)*4)*0.55;
 var c=colLerp(NIGHT,DAY,k);c=colLerp(c,DUSK,w*k);
 skyColor.setRGB(c[0],c[1],c[2]);
 scene.background=skyColor;scene.fog.color.copy(skyColor);
 amb.intensity=0.28+0.45*k;sun.intensity=0.15+0.9*k;
 stars.material.opacity=Math.max(0,0.9-k*1.4);
 var sd=new THREE.Vector3(Math.cos(th),sh,0.35).normalize();
 sun.position.set(P.x+sd.x*80,Math.max(6,P.y+sd.y*80),P.z+sd.z*80);
 sun.target.position.set(P.x,P.y,P.z);
 sunS.position.set(P.x+sd.x*300,P.y+sd.y*300,P.z+sd.z*300);
 moonS.position.set(P.x-sd.x*300,P.y-sd.y*300,P.z-sd.z*300);
 stars.position.set(P.x,0,P.z);
 // underwater
 var uw=eyeInWater();
 document.getElementById('wet').style.display=uw?'block':'none';
 if(uw){scene.fog.near=2;scene.fog.far=22;scene.fog.color.setRGB(0.08,0.2,0.45);scene.background=scene.fog.color;}
 else{scene.fog.near=52;scene.fog.far=96;}
}


// day/night probe + torch light pool (6 lights assigned to nearest torches)
var skyK=1;
function isNight(){return skyK<0.28;}
var torchLights=[],torchLT=0;
(function(){for(var ti=0;ti<6;ti++){var tl=new THREE.PointLight(0xffb066,0,9);scene.add(tl);torchLights.push(tl);}})();
function updateTorchLights(dt){
 torchLT-=dt;if(torchLT>0)return;torchLT=0.4;
 if(typeof TORCHES==='undefined')return;
 var arr=[];TORCHES.forEach(function(k2){var p=k2.split(',');var dx=p[0]-P.x,dy=p[1]-P.y,dz=p[2]-P.z;arr.push([dx*dx+dy*dy+dz*dz,+p[0],+p[1],+p[2]]);});
 arr.sort(function(a,b){return a[0]-b[0];});
 for(var i=0;i<torchLights.length;i++){var L=torchLights[i];
  if(i<arr.length&&arr[i][0]<2500){L.intensity=1.2;L.position.set(arr[i][1]+0.5,arr[i][2]+0.8,arr[i][3]+0.5);}
  else L.intensity=0;}
}

function setTimeOfDay(v){tod=Math.max(0,Math.min(0.999,v));}
