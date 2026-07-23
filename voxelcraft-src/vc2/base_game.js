

// ===================== RNG / NOISE =====================
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
var SEED=1337;
function h2(x,z){var n=Math.imul(x,374761393)+Math.imul(z,668265263)+SEED*69069;n=Math.imul(n^(n>>>13),1274126177);n^=n>>>16;return (n>>>0)/4294967296;}
function h3(x,y,z){var n=Math.imul(x,374761393)+Math.imul(y,912931)+Math.imul(z,668265263)+SEED*69069;n=Math.imul(n^(n>>>13),1274126177);n^=n>>>16;return (n>>>0)/4294967296;}
function fade(t){return t*t*(3-2*t);}
function lerp(a,b,t){return a+(b-a)*t;}
function noise2(x,z){var xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi;
 var a=h2(xi,zi),b=h2(xi+1,zi),c=h2(xi,zi+1),d=h2(xi+1,zi+1);
 return lerp(lerp(a,b,fade(xf)),lerp(c,d,fade(xf)),fade(zf));}
function fbm2(x,z,oct){var v=0,amp=.5,f=1,tot=0;for(var i=0;i<oct;i++){v+=noise2(x*f,z*f)*amp;tot+=amp;amp*=.5;f*=2;}return v/tot;}
function noise3(x,y,z){var xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=fade(x-xi),yf=fade(y-yi),zf=fade(z-zi);
 var c000=h3(xi,yi,zi),c100=h3(xi+1,yi,zi),c010=h3(xi,yi+1,zi),c110=h3(xi+1,yi+1,zi),
     c001=h3(xi,yi,zi+1),c101=h3(xi+1,yi,zi+1),c011=h3(xi,yi+1,zi+1),c111=h3(xi+1,yi+1,zi+1);
 return lerp(lerp(lerp(c000,c100,xf),lerp(c010,c110,xf),yf),lerp(lerp(c001,c101,xf),lerp(c011,c111,xf),yf),zf);}

// ===================== CONSTANTS =====================
var CH=16, WH=64, SEA=24, R=3;
var AIR=0,GRASS=1,DIRT=2,STONE=3,SAND=4,LOG=5,LEAF=6,PLANK=7,GLASS=8,BRICK=9,COBBLE=10,WATER=11,BEDROCK=12;
// tiles: [top,bottom,side]
var BLOCKS={};
BLOCKS[GRASS]={n:'Grass',t:[0,2,1]};BLOCKS[DIRT]={n:'Dirt',t:[2,2,2]};BLOCKS[STONE]={n:'Stone',t:[3,3,3]};
BLOCKS[SAND]={n:'Sand',t:[4,4,4]};BLOCKS[LOG]={n:'Log',t:[6,6,5]};BLOCKS[LEAF]={n:'Leaves',t:[7,7,7]};
BLOCKS[PLANK]={n:'Planks',t:[8,8,8]};BLOCKS[GLASS]={n:'Glass',t:[9,9,9]};BLOCKS[BRICK]={n:'Brick',t:[10,10,10]};
BLOCKS[COBBLE]={n:'Cobble',t:[12,12,12]};BLOCKS[WATER]={n:'Water',t:[11,11,11]};BLOCKS[BEDROCK]={n:'Bedrock',t:[13,13,13]};
function isOpaque(id){return id!==AIR&&id!==GLASS&&id!==WATER;}
function isSolid(id){return id!==AIR&&id!==WATER;}
var HOTBAR=[GRASS,DIRT,STONE,SAND,LOG,LEAF,PLANK,GLASS,BRICK];
var PCOL={};PCOL[GRASS]=0x79b04a;PCOL[DIRT]=0x8a6244;PCOL[STONE]=0x8b8b8b;PCOL[SAND]=0xdcd0a2;PCOL[LOG]=0x6d5433;PCOL[LEAF]=0x4e8f35;PCOL[PLANK]=0xa8834f;PCOL[GLASS]=0xcfe6ee;PCOL[BRICK]=0x9c5a50;PCOL[COBBLE]=0x7f7f7f;

// ===================== ATLAS =====================
var TS=32, ACOLS=4, atlasC=document.createElement('canvas');atlasC.width=TS*ACOLS;atlasC.height=TS*ACOLS;
var ag=atlasC.getContext('2d');
var arand=mulberry32(99);
function tileXY(t){return [ (t%ACOLS)*TS, Math.floor(t/ACOLS)*TS ];}
function speck(t,base,shades,n){var p=tileXY(t);ag.fillStyle=base;ag.fillRect(p[0],p[1],TS,TS);
 for(var i=0;i<n;i++){ag.fillStyle=shades[Math.floor(arand()*shades.length)];ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+Math.floor(arand()*TS),2,2);}}
speck(0,'#6faa3c',['#5f9430','#7cbb49','#68a337'],240);          // grass top
speck(2,'#8a6244',['#7a5238','#96704f','#6e4c34'],220);          // dirt
(function(){var p=tileXY(1);ag.drawImage(atlasC,tileXY(2)[0],tileXY(2)[1],TS,TS,p[0],p[1],TS,TS); // grass side = dirt + green band
 ag.fillStyle='#6faa3c';ag.fillRect(p[0],p[1],TS,6);
 for(var i=0;i<16;i++){ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+5+Math.floor(arand()*4),2,3);} })();
speck(3,'#8f8f8f',['#7d7d7d','#9c9c9c','#868686'],200);          // stone
speck(4,'#ddd2a0',['#d0c28c','#e6dcb0','#c9bc85'],200);          // sand
(function(){var p=tileXY(5);ag.fillStyle='#6b5230';ag.fillRect(p[0],p[1],TS,TS);   // log side
 for(var x=0;x<TS;x+=4){ag.fillStyle=(x/4)%2?'#5d4628':'#77603a';ag.fillRect(p[0]+x,p[1],2,TS);} })();
(function(){var p=tileXY(6);ag.fillStyle='#a08050';ag.fillRect(p[0],p[1],TS,TS);   // log top rings
 ag.strokeStyle='#7c6039';for(var r=13;r>2;r-=4){ag.strokeRect(p[0]+16-r,p[1]+16-r,r*2,r*2);} })();
speck(7,'#4a8c31',['#3a7326','#5aa63e','#417d2b','#2f6120'],300); // leaves
(function(){var p=tileXY(8);ag.fillStyle='#a8824e';ag.fillRect(p[0],p[1],TS,TS);   // planks
 ag.fillStyle='#8d6b3d';for(var y=7;y<TS;y+=8)ag.fillRect(p[0],p[1]+y,TS,2);
 ag.fillStyle='#96733f';for(var i=0;i<10;i++)ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+Math.floor(arand()*TS),3,1);})();
(function(){var p=tileXY(9);ag.clearRect(p[0],p[1],TS,TS);ag.fillStyle='rgba(205,235,245,0.22)';ag.fillRect(p[0],p[1],TS,TS); // glass
 ag.strokeStyle='rgba(230,248,255,0.9)';ag.lineWidth=2;ag.strokeRect(p[0]+1,p[1]+1,TS-2,TS-2);
 ag.strokeStyle='rgba(255,255,255,0.5)';ag.beginPath();ag.moveTo(p[0]+6,p[1]+14);ag.lineTo(p[0]+14,p[1]+6);ag.moveTo(p[0]+12,p[1]+24);ag.lineTo(p[0]+24,p[1]+12);ag.stroke();})();
(function(){var p=tileXY(10);ag.fillStyle='#b8b0a4';ag.fillRect(p[0],p[1],TS,TS);  // brick
 ag.fillStyle='#96524a';var bh=7,bw=15;
 for(var row=0;row<5;row++){var off=(row%2)?8:0;for(var col=-1;col<3;col++){ag.fillRect(p[0]+off+col*16+1,p[1]+row*8+1,bw,bh-1);}}})();
(function(){var p=tileXY(11);ag.clearRect(p[0],p[1],TS,TS);ag.fillStyle='rgba(38,92,196,0.62)';ag.fillRect(p[0],p[1],TS,TS); // water
 ag.fillStyle='rgba(90,150,235,0.5)';for(var i=0;i<10;i++)ag.fillRect(p[0]+Math.floor(arand()*26),p[1]+Math.floor(arand()*TS),6,1);})();
speck(12,'#7f7f7f',['#6b6b6b','#909090','#5f5f5f'],160);          // cobble
(function(){var p=tileXY(12);ag.strokeStyle='#5a5a5a';ag.lineWidth=1;               // cobble blobs
 for(var i=0;i<7;i++){ag.beginPath();ag.arc(p[0]+4+arand()*24,p[1]+4+arand()*24,3+arand()*4,0,7);ag.stroke();}})();
speck(13,'#3c3c3c',['#2e2e2e','#4a4a4a','#232323'],220);          // bedrock

// ===================== THREE SETUP =====================
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

// ===================== WORLD =====================
var chunks=new Map();
function ck(cx,cz){return cx+','+cz;}
var EDIT_KEY='voxelcraft_world_v1';
var edits={};try{edits=JSON.parse(localStorage.getItem(EDIT_KEY)||'{}');}catch(e){edits={};}
var saveT=null;function saveEdits(){clearTimeout(saveT);saveT=setTimeout(function(){try{localStorage.setItem(EDIT_KEY,JSON.stringify(edits));}catch(e){}},700);}
function terrainH(wx,wz){
 var cont=fbm2(wx*0.0045,wz*0.0045,3);
 var hills=fbm2(wx*0.02+137,wz*0.02+91,4);
 var h=14+cont*22+(hills-0.5)*15;
 if(cont>0.72)h+=(cont-0.72)*80;      // mountains
 return Math.max(3,Math.min(WH-6,Math.floor(h)));
}
function bi(x,y,z){return x|(z<<4)|(y<<8);}   // local index
function genChunk(cx,cz){
 var data=new Uint8Array(CH*CH*WH);
 for(var x=0;x<CH;x++)for(var z=0;z<CH;z++){
   var wx=cx*CH+x,wz=cz*CH+z,h=terrainH(wx,wz);
   for(var y=0;y<=h;y++){
     var id;
     if(y===0)id=BEDROCK;
     else if(y<h-3)id=STONE;
     else if(y<h)id=DIRT;
     else id=(h<=SEA+1)?SAND:GRASS;
     if(id===STONE&&y>5&&y<h-3&&noise3(wx*0.09,y*0.09,wz*0.09)>0.70)id=AIR;  // caves
     data[bi(x,y,z)]=id;
   }
   for(var y2=h+1;y2<=SEA;y2++)data[bi(x,y2,z)]=WATER;
   // trees
   if(x>=2&&x<=13&&z>=2&&z<=13&&h>SEA+1&&data[bi(x,h,z)]===GRASS&&h2(wx*3+7,wz*3+13)<0.011){
     var th=4+Math.floor(h2(wx,wz)*3);
     for(var ty=1;ty<=th&&h+ty<WH;ty++)data[bi(x,h+ty,z)]=LOG;
     for(var dy=th-2;dy<=th+1;dy++){var rr=(dy>=th)?1:2;
       for(var dx=-rr;dx<=rr;dx++)for(var dz=-rr;dz<=rr;dz++){
         if(Math.abs(dx)===rr&&Math.abs(dz)===rr&&h3(wx+dx,dy,wz+dz)<0.5)continue;
         var lx=x+dx,lz=z+dz,ly=h+dy;
         if(lx<0||lx>15||lz<0||lz>15||ly<1||ly>=WH)continue;
         if(data[bi(lx,ly,lz)]===AIR)data[bi(lx,ly,lz)]=LEAF;}}
   }
 }
 var em=edits[ck(cx,cz)];
 if(em)for(var k in em){var p=k.split(',');data[bi(+p[0],+p[1],+p[2])]=em[k];}
 var ch={cx:cx,cz:cz,data:data,meshO:null,meshT:null,dirty:true};
 chunks.set(ck(cx,cz),ch);
 [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var n=chunks.get(ck(cx+d[0],cz+d[1]));if(n)n.dirty=true;});
 return ch;
}
function getBlock(wx,wy,wz,fallback){
 if(wy<0)return BEDROCK; if(wy>=WH)return AIR;
 var cx=Math.floor(wx/CH),cz=Math.floor(wz/CH);
 var c=chunks.get(ck(cx,cz));
 if(!c)return (fallback===undefined?STONE:fallback);
 return c.data[bi(wx-cx*CH,wy,wz-cz*CH)];
}
function setBlock(wx,wy,wz,id){
 if(wy<1||wy>=WH)return false;
 var cx=Math.floor(wx/CH),cz=Math.floor(wz/CH);
 var c=chunks.get(ck(cx,cz));if(!c)return false;
 var lx=wx-cx*CH,lz=wz-cz*CH;
 c.data[bi(lx,wy,lz)]=id;c.dirty=true;
 if(lx===0){var n=chunks.get(ck(cx-1,cz));if(n)n.dirty=true;}
 if(lx===15){var n2=chunks.get(ck(cx+1,cz));if(n2)n2.dirty=true;}
 if(lz===0){var n3=chunks.get(ck(cx,cz-1));if(n3)n3.dirty=true;}
 if(lz===15){var n4=chunks.get(ck(cx,cz+1));if(n4)n4.dirty=true;}
 var key=ck(cx,cz);if(!edits[key])edits[key]={};
 edits[key][lx+','+wy+','+lz]=id;saveEdits();
 return true;
}

// ===================== MESHING =====================
// faces: normal, 4 corners, uv per corner
var FACES=[
 {n:[1,0,0], c:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]], u:[[0,0],[0,1],[1,1],[1,0]], sh:0.68},
 {n:[-1,0,0],c:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]], u:[[0,0],[0,1],[1,1],[1,0]], sh:0.68},
 {n:[0,1,0], c:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]], u:[[0,0],[1,0],[1,1],[0,1]], sh:1.0},
 {n:[0,-1,0],c:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]], u:[[0,0],[1,0],[1,1],[0,1]], sh:0.55},
 {n:[0,0,1], c:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]], u:[[0,0],[1,0],[1,1],[0,1]], sh:0.84},
 {n:[0,0,-1],c:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]], u:[[0,0],[1,0],[1,1],[0,1]], sh:0.84}
];
function tileUV(t,u,v){var col=t%ACOLS,row=Math.floor(t/ACOLS),pad=0.004;
 var u0=col/ACOLS+pad,u1=(col+1)/ACOLS-pad,v0=1-(row+1)/ACOLS+pad,v1=1-row/ACOLS-pad;
 return [u0+(u1-u0)*u, v0+(v1-v0)*v];}
function buildChunk(chnk){
 var cx=chnk.cx,cz=chnk.cz,data=chnk.data;
 var pos=[],nor=[],uv=[],col=[],idxA=[];
 var posT=[],norT=[],uvT=[],colT=[],idxT=[];
 var ox=cx*CH,oz=cz*CH;
 function gb(wx,wy,wz){ // fast path within this chunk
   if(wy<0)return BEDROCK; if(wy>=WH)return AIR;
   var lx=wx-ox,lz=wz-oz;
   if(lx>=0&&lx<16&&lz>=0&&lz<16)return data[bi(lx,wy,lz)];
   return getBlock(wx,wy,wz);
 }
 for(var y=0;y<WH;y++)for(var z=0;z<CH;z++)for(var x=0;x<CH;x++){
   var id=data[bi(x,y,z)];if(id===AIR)continue;
   var wx=ox+x,wy=y,wz=oz+z;
   var trans=(id===WATER||id===GLASS);
   var B=BLOCKS[id];
   for(var f=0;f<6;f++){
     var F=FACES[f],nb=gb(wx+F.n[0],wy+F.n[1],wz+F.n[2]);
     var visible;
     if(id===WATER)visible=(nb===AIR);
     else if(id===GLASS)visible=(nb===AIR||nb===WATER);
     else visible=!isOpaque(nb);
     if(!visible)continue;
     var tile=(f===2)?B.t[0]:(f===3)?B.t[1]:B.t[2];
     var P=trans?posT:pos,N=trans?norT:nor,U=trans?uvT:uv,C=trans?colT:col,I=trans?idxT:idxA;
     var base=P.length/3;
     var aoV=[1,1,1,1];
     if(!trans){
       // AO per corner
       var na=F.n[0]!==0?0:(F.n[1]!==0?1:2); // normal axis
       var bx=wx+F.n[0],by=wy+F.n[1],bz=wz+F.n[2];
       for(var ci=0;ci<4;ci++){
         var cc=F.c[ci];
         var o=[0,0,0],axes=[];
         for(var ax=0;ax<3;ax++){if(ax===na)continue;axes.push(ax);o[ax]=(cc[ax]===1)?1:-1;}
         var s1p=[bx,by,bz];s1p[axes[0]]+=o[axes[0]];
         var s2p=[bx,by,bz];s2p[axes[1]]+=o[axes[1]];
         var scp=[bx,by,bz];scp[axes[0]]+=o[axes[0]];scp[axes[1]]+=o[axes[1]];
         var s1=isOpaque(gb(s1p[0],s1p[1],s1p[2]))?1:0;
         var s2=isOpaque(gb(s2p[0],s2p[1],s2p[2]))?1:0;
         var sc=isOpaque(gb(scp[0],scp[1],scp[2]))?1:0;
         var ao=(s1&&s2)?0:3-(s1+s2+sc);
         aoV[ci]=0.45+ao*(0.55/3);
       }
     }
     for(var ci2=0;ci2<4;ci2++){
       var cc2=F.c[ci2];
       P.push(wx+cc2[0],wy+cc2[1],wz+cc2[2]);
       N.push(F.n[0],F.n[1],F.n[2]);
       var uvp=tileUV(tile,F.u[ci2][0],F.u[ci2][1]);U.push(uvp[0],uvp[1]);
       var b=F.sh*aoV[ci2];C.push(b,b,b);
     }
     if(aoV[0]+aoV[2] >= aoV[1]+aoV[3]) I.push(base,base+1,base+2, base,base+2,base+3);
     else I.push(base+1,base+2,base+3, base+1,base+3,base);
   }
 }
 if(chnk.meshO){scene.remove(chnk.meshO);chnk.meshO.geometry.dispose();chnk.meshO=null;}
 if(chnk.meshT){scene.remove(chnk.meshT);chnk.meshT.geometry.dispose();chnk.meshT=null;}
 function mk(P,N,U,C,I,mat,ro){
   if(!I.length)return null;
   var g=new THREE.BufferGeometry();
   g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
   g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));
   g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));
   g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
   g.setIndex(I);
   var m=new THREE.Mesh(g,mat);m.renderOrder=ro;m.frustumCulled=true;scene.add(m);return m;
 }
 chnk.meshO=mk(pos,nor,uv,col,idxA,matO,0);
 chnk.meshT=mk(posT,norT,uvT,colT,idxT,matT,1);
 chnk.dirty=false;
}

// ===================== PLAYER =====================
var P={x:8.5,y:40,z:8.5,vx:0,vy:0,vz:0,grounded:false,fly:false};
(function(){P.y=terrainH(8,8)+2;})();
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

// ===================== RAYCAST (DDA) =====================
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

// ===================== PARTICLES / AUDIO =====================
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

// ===================== HOTBAR UI =====================
var hb=document.getElementById('hotbar'),slotEls=[];
HOTBAR.forEach(function(id,i){
 var d=document.createElement('div');d.className='slot'+(i===0?' sel':'');
 var cc=document.createElement('canvas');cc.width=cc.height=TS;
 var t=BLOCKS[id].t[2],p=tileXY(t);
 var g2=cc.getContext('2d');g2.imageSmoothingEnabled=false;
 g2.fillStyle='#20283a';g2.fillRect(0,0,TS,TS);
 g2.drawImage(atlasC,p[0],p[1],TS,TS,0,0,TS,TS);
 d.appendChild(cc);
 var s=document.createElement('span');s.textContent=(i+1);d.appendChild(s);
 d.addEventListener('click',function(){selSlot(i);});
 hb.appendChild(d);slotEls.push(d);
});
function selSlot(i){sel=i;slotEls.forEach(function(e,j){e.classList.toggle('sel',j===i);});}
function toast(msg){var d=document.createElement('div');d.className='toast';d.textContent=msg;
 document.getElementById('toasts').appendChild(d);requestAnimationFrame(function(){d.classList.add('on');});
 setTimeout(function(){d.classList.remove('on');setTimeout(function(){d.remove();},400);},2600);}

// ===================== CHUNK MANAGER =====================
var genQ=[],meshQ=[];
function ensureChunks(){
 var pcx=Math.floor(P.x/CH),pcz=Math.floor(P.z/CH);
 for(var dx=-R;dx<=R;dx++)for(var dz=-R;dz<=R;dz++){
   var cx=pcx+dx,cz=pcz+dz,key=ck(cx,cz);
   if(!chunks.has(key)&&genQ.indexOf(key)<0)genQ.push(key);
 }
 genQ.sort(function(a,b){var pa=a.split(','),pb=b.split(',');
   var da=Math.pow(pa[0]-pcx,2)+Math.pow(pa[1]-pcz,2),db=Math.pow(pb[0]-pcx,2)+Math.pow(pb[1]-pcz,2);return da-db;});
 var gbudget=2;
 while(gbudget-->0&&genQ.length){var k=genQ.shift();if(chunks.has(k))continue;var p=k.split(',');genChunk(+p[0],+p[1]);}
 var mbudget=2;
 var arr=[];chunks.forEach(function(c){if(c.dirty)arr.push(c);});
 arr.sort(function(a,b){var da=Math.pow(a.cx-pcx,2)+Math.pow(a.cz-pcz,2),db=Math.pow(b.cx-pcx,2)+Math.pow(b.cz-pcz,2);return da-db;});
 for(var i=0;i<arr.length&&mbudget>0;i++){buildChunk(arr[i]);mbudget--;}
}
// initial burst around spawn
for(var idx=-1;idx<=1;idx++)for(var jdx=-1;jdx<=1;jdx++)genChunk(idx,jdx);
chunks.forEach(function(c){buildChunk(c);});

// ===================== INPUT =====================
var keys={},state='title',plBlocked=false,dragging=false,lastX=0,lastY=0,breakTimer=null,placeTimer=null;
function lookDelta(dx,dy){yaw-=dx*0.0024;pitch-=dy*0.0024;pitch=Math.max(-1.45,Math.min(1.45,pitch));}
document.addEventListener('keydown',function(e){
 keys[e.code]=true;
 if(e.code==='Space')e.preventDefault();
 if(state==='title'&&e.code==='Enter')startGame();
 if(state==='play'){
   if(e.code==='KeyF'){P.fly=!P.fly;toast(P.fly?'Flight ON':'Flight OFF');}
   if(e.code==='KeyR'){P.x=8.5;P.z=8.5;P.y=spawnY;P.vx=P.vy=P.vz=0;toast('Respawned');}
   if(e.code.indexOf('Digit')===0){var n=+e.code.slice(5);if(n>=1&&n<=9)selSlot(n-1);}
   if(e.code==='Escape'&&document.pointerLockElement!==canvas)pauseGame();
 }else if(state==='pause'&&e.code==='Escape'){resumeGame();}
});
document.addEventListener('keyup',function(e){keys[e.code]=false;});
document.addEventListener('pointerlockerror',function(){plBlocked=true;});
document.addEventListener('pointerlockchange',function(){
 if(document.pointerLockElement!==canvas&&state==='play'&&!plBlocked)pauseGame();
});
canvas.addEventListener('mousedown',function(e){
 if(state!=='play')return;
 if(!plBlocked&&document.pointerLockElement!==canvas){
   try{var pr=canvas.requestPointerLock();if(pr&&pr.catch)pr.catch(function(){plBlocked=true;});}catch(err){plBlocked=true;}
   if(!plBlocked)return; // first click locks; act on next
 }
 dragging=true;lastX=e.clientX;lastY=e.clientY;
 if(document.pointerLockElement===canvas){
   if(e.button===0){act('mine');clearInterval(breakTimer);breakTimer=setInterval(function(){act('mine');},240);}
   if(e.button===2){act('place');clearInterval(placeTimer);placeTimer=setInterval(function(){act('place');},260);}
 }
});
document.addEventListener('mouseup',function(e){
 dragging=false;clearInterval(breakTimer);clearInterval(placeTimer);
 if(state==='play'&&plBlocked&&document.pointerLockElement!==canvas){
   var dx=Math.abs(e.clientX-lastX),dy=Math.abs(e.clientY-lastY);
   if(dx<6&&dy<6){if(e.button===2)act('place');else act('mine');}
 }
});
document.addEventListener('mousemove',function(e){
 if(state!=='play')return;
 if(document.pointerLockElement===canvas)lookDelta(e.movementX,e.movementY);
 else if(dragging){lookDelta(e.clientX-lastX,e.clientY-lastY);lastX=e.clientX;lastY=e.clientY;}
});
document.addEventListener('contextmenu',function(e){e.preventDefault();});
document.addEventListener('wheel',function(e){if(state!=='play')return;selSlot((sel+(e.deltaY>0?1:-1)+9)%9);},{passive:true});
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

function act(kind){
 var r=raycast(7);
 if(!r)return;
 if(kind==='mine'){
   if(r.id===BEDROCK){toast('Bedrock is unbreakable');return;}
   setBlock(r.x,r.y,r.z,AIR);
   burst(r.x,r.y,r.z,PCOL[r.id]||0x999999);
   blip(300,90,0.09,0.12);
 }else{
   var tgt=getBlock(r.px,r.py,r.pz,AIR);
   if(tgt!==AIR&&tgt!==WATER)return;
   // don't place inside player
   var b={x:r.px,y:r.py,z:r.pz};
   if(b.x+1>P.x-HW&&b.x<P.x+HW&&b.y+1>P.y&&b.y<P.y+HH&&b.z+1>P.z-HW&&b.z<P.z+HW)return;
   setBlock(r.px,r.py,r.pz,HOTBAR[sel]);
   blip(520,340,0.06,0.1);
 }
}

// ===================== GAME STATE =====================
var titleEl=document.getElementById('title'),pauseEl=document.getElementById('pause'),playBtn=document.getElementById('play');
function startGame(){
 if(playBtn.disabled||state==='play')return;
 titleEl.style.display='none';state='play';
 try{var pr=canvas.requestPointerLock();if(pr&&pr.catch)pr.catch(function(){plBlocked=true;});}catch(err){plBlocked=true;}
 setTimeout(function(){if(plBlocked)toast('Cursor lock unavailable — click & drag to look');},600);
 toast('Left click mines · right click builds');
}
function pauseGame(){if(state!=='play')return;state='pause';pauseEl.style.display='flex';}
function resumeGame(){state='play';pauseEl.style.display='none';
 try{var pr=canvas.requestPointerLock();if(pr&&pr.catch)pr.catch(function(){});}catch(err){}}
playBtn.addEventListener('click',startGame);
document.getElementById('resume').addEventListener('click',resumeGame);
document.getElementById('reset').addEventListener('click',function(){
 if(confirm('Reset the whole world? This clears your saved edits.')){localStorage.removeItem(EDIT_KEY);location.reload();}});

// ===================== DAY / NIGHT =====================
var DAYLEN=240,tod=0.28;
function colLerp(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
var NIGHT=[0.015,0.03,0.08],DAY=[0.545,0.71,0.94],DUSK=[0.98,0.55,0.32];
var skyColor=new THREE.Color();
function updateSky(dt){
 tod=(tod+dt/DAYLEN)%1;
 var th=tod*Math.PI*2,sh=Math.sin(th);
 var k=Math.max(0,Math.min(1,(sh+0.15)*2.4));
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

// ===================== MAIN LOOP =====================
var last=performance.now(),fpsN=0,fpsT=0,fps=0,ready=false,readyTarget=25;
function frame(now){
 requestAnimationFrame(frame);
 var dt=Math.min(0.05,(now-last)/1000);last=now;
 ensureChunks();
 if(!ready){
   var meshed=0;chunks.forEach(function(c){if(!c.dirty)meshed++;});
   var pct=Math.min(1,meshed/readyTarget);
   document.getElementById('barF').style.width=(pct*100)+'%';
   if(meshed>=readyTarget){ready=true;playBtn.disabled=false;playBtn.textContent='PLAY ▸';document.getElementById('bar').style.display='none';}
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
   var spd=P.fly?14:(water?3.2:(keys.ControlLeft?7.2:4.4));
   var ax=wish.x*spd,az=wish.z*spd,k2=Math.min(1,(P.fly?8:12)*dt);
   P.vx+=(ax-P.vx)*k2;P.vz+=(az-P.vz)*k2;
   if(P.fly){P.vy+=(((keys.Space?9:0)+(keys.ShiftLeft?-9:0))-P.vy)*k2;}
   else if(water){P.vy+= (keys.Space? (3.4-P.vy)*Math.min(1,10*dt) : -5*dt);P.vy=Math.max(P.vy,-3.2);}
   else{P.vy-=26*dt;if(P.vy<-42)P.vy=-42;
     if(keys.Space&&P.grounded)P.vy=8.6;}
   P.grounded=false;
   moveAxis('y',P.vy*dt);
   moveAxis('x',P.vx*dt);
   moveAxis('z',P.vz*dt);
   if(P.y<-12){P.x=8.5;P.z=8.5;P.y=spawnY;P.vy=0;toast('The void spat you back out');}
   camera.position.set(P.x,P.y+EYE,P.z);
   camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
   // highlight
   var rr=raycast(7);
   if(rr){hl.visible=true;hl.position.set(rr.x+0.5,rr.y+0.5,rr.z+0.5);}else hl.visible=false;
   // HUD
   fpsN++;fpsT+=dt;if(fpsT>0.5){fps=Math.round(fpsN/fpsT);fpsN=0;fpsT=0;}
   document.getElementById('coords').innerHTML='XYZ '+P.x.toFixed(0)+' '+P.y.toFixed(0)+' '+P.z.toFixed(0)+'<br>'+fps+' fps · '+chunks.size+' chunks'+(P.fly?' · FLY':'');
 } else if(state==='title'){
   // cinematic orbit
   var t=now/1000;
   var cx=8.5+Math.cos(t*0.12)*26,cz=8.5+Math.sin(t*0.12)*26;
   var cy=terrainH(8,8)+14;
   camera.position.set(cx,cy,cz);
   camera.lookAt(8.5,terrainH(8,8)+2,8.5);
 }
 updateSky(dt);updParts(dt);
 for(var i=0;i<clouds.length;i++){var c=clouds[i];c.position.x+=dt*1.4;
   if(c.position.x>P.x+160)c.position.x=P.x-160;
   if(c.position.x<P.x-170)c.position.x=P.x+150;}
 renderer.render(scene,camera);
}
requestAnimationFrame(frame);
