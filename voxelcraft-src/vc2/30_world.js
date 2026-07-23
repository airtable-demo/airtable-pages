// MODULE 30: chunk store + mesher + manager (OWNER: core)
// ===== WORLD =====

var chunks=new Map();
var TORCHES=new Set();
function ck(cx,cz){return cx+','+cz;}
var EDIT_KEY='voxelcraft_world_v1';
var edits={};try{edits=JSON.parse(localStorage.getItem(EDIT_KEY)||'{}');}catch(e){edits={};}
var WMETA=null;
try{WMETA=JSON.parse(localStorage.getItem('voxelcraft_meta_v1')||'null');}catch(e){WMETA=null;}
if(!WMETA||typeof WMETA.seed!=='number'){
 WMETA={seed:Math.floor(Math.random()*899999999)+1000,sx:8,sz:8};
 SEED=WMETA.seed;
 for(var att=0;att<60;att++){
  var tx=Math.floor((Math.random()*2-1)*600),tz=Math.floor((Math.random()*2-1)*600);
  var hh=terrainH(tx,tz);
  if(hh>SEA+1&&hh<42){WMETA.sx=tx;WMETA.sz=tz;break;}
 }
 try{localStorage.setItem('voxelcraft_meta_v1',JSON.stringify(WMETA));}catch(e){}
}
SEED=WMETA.seed;
var SPAWNX=WMETA.sx+0.5,SPAWNZ=WMETA.sz+0.5;
var saveT=null;function saveEdits(){
 if(typeof mpIsGuest==='function'&&mpIsGuest())return; // guests never overwrite their own world save
 clearTimeout(saveT);saveT=setTimeout(function(){try{localStorage.setItem(EDIT_KEY,JSON.stringify(edits));}catch(e){}},700);}
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
 if(typeof TORCH!=='undefined'){if(id===TORCH)TORCHES.add(wx+','+wy+','+wz);else TORCHES.delete(wx+','+wy+','+wz);}
 if(lx===0){var n=chunks.get(ck(cx-1,cz));if(n)n.dirty=true;}
 if(lx===15){var n2=chunks.get(ck(cx+1,cz));if(n2)n2.dirty=true;}
 if(lz===0){var n3=chunks.get(ck(cx,cz-1));if(n3)n3.dirty=true;}
 if(lz===15){var n4=chunks.get(ck(cx,cz+1));if(n4)n4.dirty=true;}
 var key=ck(cx,cz);if(!edits[key])edits[key]={};
 edits[key][lx+','+wy+','+lz]=id;saveEdits();
 if(typeof mpOnBlock==='function')mpOnBlock(wx,wy,wz,id);
 return true;
}

// ===== MESHING =====

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
   var B=BLOCKS[id];if(!B)continue;
   var shape=B.shape||'cube';
   if(shape!=='cube'){pushShape(shape,B,wx,wy,wz,posT,norT,uvT,colT,idxT);continue;}
   var trans=(B.trans===true);
   for(var f=0;f<6;f++){
     var F=FACES[f],nb=gb(wx+F.n[0],wy+F.n[1],wz+F.n[2]);
     var visible;
     if(id===WATER)visible=(nb===AIR);
     else if(trans)visible=(!isOpaque(nb)&&nb!==id);
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
       var cy2=cc2[1];if(id===WATER&&cy2===1&&gb(wx,wy+1,wz)!==WATER)cy2=0.875;
       P.push(wx+cc2[0],wy+cy2,wz+cc2[2]);
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

// ===== CHUNK MANAGER =====

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
// (initial spawn burst moved to 50_game.js initWorld)


// non-cube shapes: cross (flowers/grass) and torch - rendered into the transparent mesh, no culling/AO
function pushShape(shape,B,wx,wy,wz,P,N,U,C,I){
 var tile=B.t[2];
 function quad(c0,c1,c2,c3){
  var base=P.length/3,cs=[c0,c1,c2,c3],uvs=[[0,0],[1,0],[1,1],[0,1]];
  for(var i=0;i<4;i++){P.push(wx+cs[i][0],wy+cs[i][1],wz+cs[i][2]);N.push(0,1,0);
   var uvp=tileUV(tile,uvs[i][0],uvs[i][1]);U.push(uvp[0],uvp[1]);C.push(1,1,1);}
  I.push(base,base+1,base+2,base,base+2,base+3);
 }
 if(shape==='slab'){
  // half-height cube rendered as full cube with top at 0.5 — pushed via cube path is complex; draw 5 faces here
  var a2=0.0,b2=1.0,h2v=0.5;
  quad([a2,0,b2],[b2,0,b2],[b2,h2v,b2],[a2,h2v,b2]);
  quad([b2,0,a2],[a2,0,a2],[a2,h2v,a2],[b2,h2v,a2]);
  quad([a2,0,a2],[a2,0,b2],[a2,h2v,b2],[a2,h2v,a2]);
  quad([b2,0,b2],[b2,0,a2],[b2,h2v,a2],[b2,h2v,b2]);
  quad([a2,h2v,a2],[b2,h2v,a2],[b2,h2v,b2],[a2,h2v,b2]);
  return;
 }
 if(shape==='cross'){
  quad([0.15,0,0.15],[0.85,0,0.85],[0.85,1,0.85],[0.15,1,0.15]);
  quad([0.85,0,0.15],[0.15,0,0.85],[0.15,1,0.85],[0.85,1,0.15]);
 }else if(shape==='torch'){
  var a=0.44,b=0.56,h=0.62;
  quad([a,0,a],[b,0,a],[b,h,a],[a,h,a]);
  quad([b,0,b],[a,0,b],[a,h,b],[b,h,b]);
  quad([a,0,b],[a,0,a],[a,h,a],[a,h,b]);
  quad([b,0,a],[b,0,b],[b,h,b],[b,h,a]);
  quad([a,h,a],[b,h,a],[b,h,b],[a,h,b]);
 }
}
function findGroundY(wx,wz){for(var y=WH-1;y>0;y--){if(isSolid(getBlock(wx,y,wz,AIR)))return y+1;}return SEA+1;}
