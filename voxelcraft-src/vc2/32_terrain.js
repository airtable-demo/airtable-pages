// MODULE 32: terrain generation - biomes, ores, trees, decorations (OWNER: Terra)
// CONTRACT: define all config data INSIDE functions (top-level var init order is not guaranteed for callers).
function terrainH(wx,wz){
 var cont=fbm2(wx*0.0045,wz*0.0045,3);
 var hills=fbm2(wx*0.02+137,wz*0.02+91,4);
 var h=14+cont*22+(hills-0.5)*15;
 if(cont>0.72)h+=(cont-0.72)*80;      // mountains
 return Math.max(3,Math.min(WH-6,Math.floor(h)));
}
// biomeAt: computed once per column (never per-block) - keeps genChunk fast.
function biomeAt(wx,wz){
 var temperature=fbm2(wx*0.0035+500,wz*0.0035+500,2);
 var moisture=fbm2(wx*0.003-800,wz*0.003-800,2);
 if(temperature<0.34)return 'snow';
 if(temperature>0.66&&moisture<0.45)return 'desert';
 if(moisture>0.55)return 'forest';
 return 'plains';
}
function bi(x,y,z){return x|(z<<4)|(y<<8);}   // local index
function genChunk(cx,cz){
 if(cx*CH>50000)return genEndChunk(cx,cz);
 var data=new Uint8Array(CH*CH*WH);
 for(var x=0;x<CH;x++)for(var z=0;z<CH;z++){
   var wx=cx*CH+x,wz=cz*CH+z,h=terrainH(wx,wz);
   var biome=biomeAt(wx,wz);
   var isBeach=(h<=SEA+1);
   var mountainCap=(h>=44);
   for(var y=0;y<=h;y++){
     var id;
     if(y===0)id=BEDROCK;
     else if(y<h-3)id=STONE;
     else if(y<h){
       id=(biome==='desert')?SANDSTONE:DIRT;
     }else{ // surface block
       if(mountainCap)id=SNOWBLK;
       else if(isBeach)id=SAND;
       else if(biome==='desert')id=SAND;
       else if(biome==='snow')id=SNOWGRASS;
       else id=GRASS; // plains/forest
     }
     if(id===STONE&&y>5&&y<h-3&&noise3(wx*0.09,y*0.09,wz*0.09)>0.70)id=AIR;  // caves
     // ores: replace remaining STONE with rarer-wins ordering (diamond > gold > iron > coal)
     if(id===STONE){
       if(y<12&&h3(wx,y*7,wz+900)<0.0045)id=DIAMOND_ORE;
       else if(y<18&&h3(wx-900,y*7,wz)<0.007)id=GOLD_ORE;
       else if(y<30&&h3(wx+900,y*7,wz)<0.014)id=IRON_ORE;
       else if(y<44&&h3(wx,y*7,wz)<0.022)id=COAL_ORE;
     }
     data[bi(x,y,z)]=id;
   }
   for(var y2=h+1;y2<=SEA;y2++)data[bi(x,y2,z)]=WATER;
   if(biome==='snow'&&h<=SEA&&data[bi(x,SEA,z)]===WATER)data[bi(x,SEA,z)]=ICE; // frozen surface in snow biome

   // ----- vegetation (only within the 2..13 interior band to avoid cross-chunk seams) -----
   var inBand=(x>=2&&x<=13&&z>=2&&z<=13);
   if(biome==='desert'){
     // cacti instead of trees - grow on any sand top in the desert biome (h2 rate ~0.004)
     if(inBand&&h>0&&data[bi(x,h,z)]===SAND&&h2(wx*3+7,wz*3+13)<0.004){
       var cactH=1+Math.floor(h2(wx,wz)*3);
       for(var cy=1;cy<=cactH&&h+cy<WH;cy++){
         if(data[bi(x,h+cy,z)]===AIR)data[bi(x,h+cy,z)]=CACTUS;
       }
     }
   }else if(biome==='snow'){
     // spruce trees: taller trunk, narrow conical SPRUCELEAF crown
     if(inBand&&h>SEA+1&&data[bi(x,h,z)]===SNOWGRASS&&h2(wx*3+7,wz*3+13)<0.011){
       var sth=5+Math.floor(h2(wx,wz)*3); // 5-7
       for(var sty=1;sty<=sth&&h+sty<WH;sty++)data[bi(x,h+sty,z)]=LOG;
       for(var sdy=2;sdy<=sth+1;sdy++){
         var srr=Math.max(0,2-Math.floor((sdy-2)/2)); // narrows toward top: 2,2,1,1,0
         if(sdy===sth+1)srr=0;
         for(var sdx=-srr;sdx<=srr;sdx++)for(var sdz=-srr;sdz<=srr;sdz++){
           if(Math.abs(sdx)===srr&&Math.abs(sdz)===srr&&srr>0&&h3(wx+sdx,sdy,wz+sdz)<0.5)continue;
           var slx=x+sdx,slz=z+sdz,sly=h+sdy;
           if(slx<0||slx>15||slz<0||slz>15||sly<1||sly>=WH)continue;
           if(data[bi(slx,sly,slz)]===AIR)data[bi(slx,sly,slz)]=SPRUCELEAF;}}
     }
   }else{
     // plains/forest: normal oak trees, forest ~3x density
     var treeRate=(biome==='forest')?0.033:0.011;
     if(inBand&&h>SEA+1&&data[bi(x,h,z)]===GRASS&&h2(wx*3+7,wz*3+13)<treeRate){
       var th=4+Math.floor(h2(wx,wz)*3);
       for(var ty=1;ty<=th&&h+ty<WH;ty++)data[bi(x,h+ty,z)]=LOG;
       for(var dy=th-2;dy<=th+1;dy++){var rr=(dy>=th)?1:2;
         for(var dx=-rr;dx<=rr;dx++)for(var dz=-rr;dz<=rr;dz++){
           if(Math.abs(dx)===rr&&Math.abs(dz)===rr&&h3(wx+dx,dy,wz+dz)<0.5)continue;
           var lx=x+dx,lz=z+dz,ly=h+dy;
           if(lx<0||lx>15||lz<0||lz>15||ly<1||ly>=WH)continue;
           if(data[bi(lx,ly,lz)]===AIR)data[bi(lx,ly,lz)]=LEAF;}}
     }
     // ground decorations on grass, after trees, only where the block above the surface is still AIR
     if(h>SEA+1&&data[bi(x,h,z)]===GRASS&&data[bi(x,h+1,z)]===AIR){
       if(h2(wx*5+31,wz*5+17)<0.045)data[bi(x,h+1,z)]=TALLGRASS;
       else if(h2(wx*5-53,wz*5+91)<0.008)data[bi(x,h+1,z)]=FLOWER_R;
       else if(h2(wx*5+77,wz*5-29)<0.008)data[bi(x,h+1,z)]=FLOWER_Y;
     }
   }
 }
 var em=edits[ck(cx,cz)];
 if(em)for(var k in em){
   var p=k.split(',');var lx2=+p[0],ly2=+p[1],lz2=+p[2],eid=+em[k];
   data[bi(lx2,ly2,lz2)]=eid;
   if(typeof TORCH!=='undefined'&&eid===TORCH)TORCHES.add((cx*16+lx2)+','+ly2+','+(cz*16+lz2));
 }
 var ch={cx:cx,cz:cz,data:data,meshO:null,meshT:null,dirty:true};
 chunks.set(ck(cx,cz),ch);
 [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var n=chunks.get(ck(cx+d[0],cz+d[1]));if(n)n.dirty=true;});
 return ch;
}
