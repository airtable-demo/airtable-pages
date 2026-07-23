// MODULE 12: block registry + atlas painters (OWNER: Terra)
// ===== CONSTANTS =====

var CH=16, WH=64, SEA=24, R=3;
var AIR=0,GRASS=1,DIRT=2,STONE=3,SAND=4,LOG=5,LEAF=6,PLANK=7,GLASS=8,BRICK=9,COBBLE=10,WATER=11,BEDROCK=12;
var SNOWGRASS=13,SNOWBLK=14,ICE=15,CACTUS=16,SANDSTONE=17,SPRUCELEAF=18,FLOWER_R=19,FLOWER_Y=20,
    TALLGRASS=21,COAL_ORE=22,IRON_ORE=23,GOLD_ORE=24,DIAMOND_ORE=25,TORCH=26,WOOL=27;
var FURNACE=31;
// tiles: [top,bottom,side]
var BLOCKS={};
BLOCKS[GRASS]={n:'Grass',t:[0,2,1]};BLOCKS[DIRT]={n:'Dirt',t:[2,2,2]};BLOCKS[STONE]={n:'Stone',t:[3,3,3]};
BLOCKS[SAND]={n:'Sand',t:[4,4,4]};BLOCKS[LOG]={n:'Log',t:[6,6,5]};BLOCKS[LEAF]={n:'Leaves',t:[7,7,7]};
BLOCKS[PLANK]={n:'Planks',t:[8,8,8]};BLOCKS[GLASS]={n:'Glass',t:[9,9,9]};BLOCKS[BRICK]={n:'Brick',t:[10,10,10]};
BLOCKS[COBBLE]={n:'Cobble',t:[12,12,12]};BLOCKS[WATER]={n:'Water',t:[11,11,11]};BLOCKS[BEDROCK]={n:'Bedrock',t:[13,13,13]};
// ----- patch existing translucent/see-through defs so mesher treats them right -----
BLOCKS[WATER].opaque=false;BLOCKS[WATER].solid=false;BLOCKS[WATER].trans=true;
BLOCKS[GLASS].opaque=false;BLOCKS[GLASS].trans=true;

// ----- new block registrations (tile indices assigned in atlas section below) -----
// atlas tile map for indices 14+ (see painters below):
//  14 snow top          15 snowy-grass side     16 snow block          17 ice
//  18 cactus side        19 cactus top           20 sandstone           21 spruce leaves
//  22 flower red         23 flower yellow        24 tall grass          25 coal ore
//  26 iron ore           27 gold ore             28 diamond ore         29 torch
//  30 wool (knit white)
//  34 furnace side (mouth)  35 furnace top (plain dark stone)
BLOCKS[SNOWGRASS]={n:'Snowy Grass',t:[14,2,15]};
BLOCKS[SNOWBLK]={n:'Snow Block',t:[16,16,16]};
BLOCKS[ICE]={n:'Ice',t:[17,17,17],opaque:false,trans:true};
BLOCKS[CACTUS]={n:'Cactus',t:[19,19,18]};
BLOCKS[SANDSTONE]={n:'Sandstone',t:[20,20,20]};
BLOCKS[SPRUCELEAF]={n:'Spruce Leaves',t:[21,21,21]};
BLOCKS[FLOWER_R]={n:'Red Flower',t:[22,22,22],opaque:false,solid:false,trans:true,shape:'cross'};
BLOCKS[FLOWER_Y]={n:'Yellow Flower',t:[23,23,23],opaque:false,solid:false,trans:true,shape:'cross'};
BLOCKS[TALLGRASS]={n:'Tall Grass',t:[24,24,24],opaque:false,solid:false,trans:true,shape:'cross'};
BLOCKS[COAL_ORE]={n:'Coal Ore',t:[25,25,25]};
BLOCKS[IRON_ORE]={n:'Iron Ore',t:[26,26,26]};
BLOCKS[GOLD_ORE]={n:'Gold Ore',t:[27,27,27]};
BLOCKS[DIAMOND_ORE]={n:'Diamond Ore',t:[28,28,28]};
BLOCKS[TORCH]={n:'Torch',t:[29,29,29],opaque:false,solid:false,trans:true,shape:'torch'};
BLOCKS[WOOL]={n:'Wool',t:[30,30,30]};
BLOCKS[FURNACE]={n:'Furnace',t:[35,35,34]};

// ----- registry-driven solidity/opacity -----
function isOpaque(id){var B=BLOCKS[id];return !!B&&B.opaque!==false;}
function isSolid(id){var B=BLOCKS[id];return !!B&&B.solid!==false;}

var HOTBAR_SETS=[[GRASS,DIRT,STONE,SAND,LOG,LEAF,PLANK,GLASS,BRICK],
                 [COBBLE,SANDSTONE,SNOWBLK,CACTUS,TORCH,COAL_ORE,IRON_ORE,GOLD_ORE,DIAMOND_ORE],
                 [WOOL,ICE,SPRUCELEAF,LEAF,LOG,PLANK,GLASS,FURNACE,SNOWBLK]];
var HOTBAR=HOTBAR_SETS[0];
var PCOL={};PCOL[GRASS]=0x79b04a;PCOL[DIRT]=0x8a6244;PCOL[STONE]=0x8b8b8b;PCOL[SAND]=0xdcd0a2;PCOL[LOG]=0x6d5433;PCOL[LEAF]=0x4e8f35;PCOL[PLANK]=0xa8834f;PCOL[GLASS]=0xcfe6ee;PCOL[BRICK]=0x9c5a50;PCOL[COBBLE]=0x7f7f7f;
PCOL[BEDROCK]=0x2e2e2e;PCOL[WATER]=0x3f7fd6;
PCOL[SNOWGRASS]=0xeef4f8;PCOL[SNOWBLK]=0xf3f7fb;PCOL[ICE]=0xbfe3f0;PCOL[CACTUS]=0x2f7d3a;PCOL[SANDSTONE]=0xe0d3a0;
PCOL[SPRUCELEAF]=0x2f5b46;PCOL[FLOWER_R]=0xd23c3c;PCOL[FLOWER_Y]=0xe0c93a;PCOL[TALLGRASS]=0x5c9a3d;
PCOL[COAL_ORE]=0x3a3a3a;PCOL[IRON_ORE]=0xcaa87c;PCOL[GOLD_ORE]=0xe8cd4a;PCOL[DIAMOND_ORE]=0x6fe0e0;PCOL[TORCH]=0xd99a3f;
PCOL[WOOL]=0xe8e6e0;
PCOL[FURNACE]=0x6f6f6f;

// ===== ATLAS =====

var TS=32, ACOLS=8, atlasC=document.createElement('canvas');atlasC.width=TS*ACOLS;atlasC.height=TS*ACOLS;
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

// ----- NEW TILES (14-29) -----

speck(14,'#f4f8fc',['#e7eef6','#ffffff','#dfe9f2'],220);         // 14 snow top
(function(){var p=tileXY(15);ag.drawImage(atlasC,tileXY(2)[0],tileXY(2)[1],TS,TS,p[0],p[1],TS,TS); // 15 snowy-grass side = dirt + snow cap band
 ag.fillStyle='#f2f7fb';ag.fillRect(p[0],p[1],TS,9);
 ag.fillStyle='#e3edf6';ag.fillRect(p[0],p[1]+7,TS,3);
 for(var i=0;i<14;i++){ag.fillStyle=(arand()<0.5)?'#ffffff':'#dbe6f0';ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+6+Math.floor(arand()*5),2,3);} })();
speck(16,'#eef4f9',['#ffffff','#e2ecf4','#d8e4ee'],240);         // 16 snow block
(function(){var p=tileXY(17);ag.clearRect(p[0],p[1],TS,TS);ag.fillStyle='rgba(180,225,240,0.55)';ag.fillRect(p[0],p[1],TS,TS); // 17 ice (translucent)
 ag.fillStyle='rgba(225,248,255,0.55)';ag.fillRect(p[0]+2,p[1]+2,TS-4,TS-4);
 ag.strokeStyle='rgba(255,255,255,0.6)';ag.lineWidth=1;
 ag.beginPath();ag.moveTo(p[0]+4,p[1]+26);ag.lineTo(p[0]+16,p[1]+10);ag.moveTo(p[0]+10,p[1]+30);ag.lineTo(p[0]+26,p[1]+6);ag.moveTo(p[0]+20,p[1]+28);ag.lineTo(p[0]+28,p[1]+18);ag.stroke();})();
(function(){var p=tileXY(18);ag.fillStyle='#347a3d';ag.fillRect(p[0],p[1],TS,TS);   // 18 cactus side: green + darker vertical ribs
 for(var i=0;i<70;i++){ag.fillStyle=(arand()<0.5)?'#3c8945':'#2c6c34';ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+Math.floor(arand()*TS),2,2);}
 ag.fillStyle='#245a2b';for(var x=4;x<TS;x+=9){ag.fillRect(p[0]+x,p[1],2,TS);}
 ag.fillStyle='#63a967';for(var y2=3;y2<TS;y2+=7){ag.fillRect(p[0]+2,p[1]+y2,3,1);ag.fillRect(p[0]+TS-6,p[1]+y2+3,3,1);}})();
speck(19,'#3a8a44',['#347a3d','#4a9a54','#2c6c34'],160);         // 19 cactus top
(function(){var p=tileXY(20);ag.fillStyle='#dccb96';ag.fillRect(p[0],p[1],TS,TS);   // 20 sandstone: pale banded
 for(var y3=0;y3<TS;y3+=6){ag.fillStyle=(y3/6)%2?'#d3c088':'#e5d5a4';ag.fillRect(p[0],p[1]+y3,TS,6);}
 ag.fillStyle='#c8b378';for(var i2=0;i2<14;i2++){ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+Math.floor(arand()*TS),3,1);}})();
speck(21,'#28503f',['#1e3f30','#325f4a','#194635'],300);        // 21 spruce leaves (darker blue-green)
(function(){var p=tileXY(22);ag.clearRect(p[0],p[1],TS,TS);   // 22 flower red: transparent bg + stem + bloom
 ag.strokeStyle='#2f6d2f';ag.lineWidth=2;ag.beginPath();ag.moveTo(p[0]+16,p[1]+30);ag.lineTo(p[0]+16,p[1]+18);ag.stroke();
 ag.fillStyle='#3a7a35';ag.fillRect(p[0]+13,p[1]+22,4,3);
 ag.fillStyle='#d23c3c';
 ag.beginPath();ag.arc(p[0]+16,p[1]+12,3,0,7);ag.fill();
 ag.beginPath();ag.arc(p[0]+11,p[1]+14,3,0,7);ag.fill();
 ag.beginPath();ag.arc(p[0]+21,p[1]+14,3,0,7);ag.fill();
 ag.beginPath();ag.arc(p[0]+13,p[1]+9,3,0,7);ag.fill();
 ag.beginPath();ag.arc(p[0]+19,p[1]+9,3,0,7);ag.fill();
 ag.fillStyle='#f0d33c';ag.beginPath();ag.arc(p[0]+16,p[1]+12,2,0,7);ag.fill();})();
(function(){var p=tileXY(23);ag.clearRect(p[0],p[1],TS,TS);   // 23 flower yellow
 ag.strokeStyle='#2f6d2f';ag.lineWidth=2;ag.beginPath();ag.moveTo(p[0]+16,p[1]+30);ag.lineTo(p[0]+16,p[1]+18);ag.stroke();
 ag.fillStyle='#3a7a35';ag.fillRect(p[0]+13,p[1]+22,4,3);
 ag.fillStyle='#e8cd3a';
 ag.beginPath();ag.arc(p[0]+16,p[1]+12,3,0,7);ag.fill();
 ag.beginPath();ag.arc(p[0]+11,p[1]+14,3,0,7);ag.fill();
 ag.beginPath();ag.arc(p[0]+21,p[1]+14,3,0,7);ag.fill();
 ag.beginPath();ag.arc(p[0]+13,p[1]+9,3,0,7);ag.fill();
 ag.beginPath();ag.arc(p[0]+19,p[1]+9,3,0,7);ag.fill();
 ag.fillStyle='#a5642a';ag.beginPath();ag.arc(p[0]+16,p[1]+12,2,0,7);ag.fill();})();
(function(){var p=tileXY(24);ag.clearRect(p[0],p[1],TS,TS);   // 24 tall grass: transparent bg, thin green blades
 ag.strokeStyle='#4f8c34';ag.lineWidth=2;
 var bx=[6,11,16,21,26];
 for(var i3=0;i3<bx.length;i3++){var sway=(i3%2?3:-3);
   ag.beginPath();ag.moveTo(p[0]+bx[i3],p[1]+30);ag.quadraticCurveTo(p[0]+bx[i3]+sway,p[1]+18,p[0]+bx[i3]+sway*1.4,p[1]+6);ag.stroke();}
 ag.strokeStyle='#5c9a3d';ag.lineWidth=1.4;
 for(var i4=0;i4<bx.length;i4++){var sway2=(i4%2?-2:2);
   ag.beginPath();ag.moveTo(p[0]+bx[i4]+2,p[1]+30);ag.quadraticCurveTo(p[0]+bx[i4]+2+sway2,p[1]+20,p[0]+bx[i4]+2+sway2,p[1]+10);ag.stroke();}})();
(function(){var p=tileXY(25);ag.fillStyle='#8f8f8f';ag.fillRect(p[0],p[1],TS,TS);   // 25 coal ore: stone + dark specks clusters
 for(var i5=0;i5<220;i5++){ag.fillStyle=(arand()<0.55)?'#7d7d7d':'#9c9c9c';ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+Math.floor(arand()*TS),2,2);}
 var clusters1=[[9,9],[21,12],[13,22],[23,24]];
 for(var c1=0;c1<clusters1.length;c1++){var cx1=p[0]+clusters1[c1][0],cy1=p[1]+clusters1[c1][1];
   for(var d1=0;d1<6;d1++){ag.fillStyle='#1b1b1b';ag.fillRect(cx1+Math.floor((arand()-0.5)*7),cy1+Math.floor((arand()-0.5)*7),3,3);}}})();
(function(){var p=tileXY(26);ag.fillStyle='#8f8f8f';ag.fillRect(p[0],p[1],TS,TS);   // 26 iron ore: stone + tan/cream specks
 for(var i6=0;i6<220;i6++){ag.fillStyle=(arand()<0.55)?'#7d7d7d':'#9c9c9c';ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+Math.floor(arand()*TS),2,2);}
 var clusters2=[[10,10],[22,13],[14,23],[24,25]];
 for(var c2=0;c2<clusters2.length;c2++){var cx2=p[0]+clusters2[c2][0],cy2=p[1]+clusters2[c2][1];
   for(var d2=0;d2<6;d2++){ag.fillStyle=(arand()<0.5)?'#d9bd8e':'#e9d9b0';ag.fillRect(cx2+Math.floor((arand()-0.5)*7),cy2+Math.floor((arand()-0.5)*7),3,3);}}})();
(function(){var p=tileXY(27);ag.fillStyle='#8f8f8f';ag.fillRect(p[0],p[1],TS,TS);   // 27 gold ore: stone + yellow specks
 for(var i7=0;i7<220;i7++){ag.fillStyle=(arand()<0.55)?'#7d7d7d':'#9c9c9c';ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+Math.floor(arand()*TS),2,2);}
 var clusters3=[[9,11],[21,10],[12,23],[23,23]];
 for(var c3=0;c3<clusters3.length;c3++){var cx3=p[0]+clusters3[c3][0],cy3=p[1]+clusters3[c3][1];
   for(var d3=0;d3<6;d3++){ag.fillStyle=(arand()<0.5)?'#e8cd4a':'#f5e37a';ag.fillRect(cx3+Math.floor((arand()-0.5)*7),cy3+Math.floor((arand()-0.5)*7),3,3);}}})();
(function(){var p=tileXY(28);ag.fillStyle='#8f8f8f';ag.fillRect(p[0],p[1],TS,TS);   // 28 diamond ore: stone + cyan specks
 for(var i8=0;i8<220;i8++){ag.fillStyle=(arand()<0.55)?'#7d7d7d':'#9c9c9c';ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+Math.floor(arand()*TS),2,2);}
 var clusters4=[[10,9],[22,12],[13,21],[22,25]];
 for(var c4=0;c4<clusters4.length;c4++){var cx4=p[0]+clusters4[c4][0],cy4=p[1]+clusters4[c4][1];
   for(var d4=0;d4<6;d4++){ag.fillStyle=(arand()<0.5)?'#6fe0e0':'#b6f5f0';ag.fillRect(cx4+Math.floor((arand()-0.5)*6),cy4+Math.floor((arand()-0.5)*6),3,3);}}})();
(function(){var p=tileXY(29);ag.clearRect(p[0],p[1],TS,TS);   // 29 torch: transparent bg, brown stick + flame tip
 ag.fillStyle='#6b4a2c';ag.fillRect(p[0]+14,p[1]+13,4,18);
 ag.fillStyle='#5a3c22';ag.fillRect(p[0]+14,p[1]+13,1,18);ag.fillRect(p[0]+17,p[1]+13,1,18);
 ag.fillStyle='#d9922f';ag.beginPath();ag.moveTo(p[0]+16,p[1]+4);ag.lineTo(p[0]+21,p[1]+13);ag.lineTo(p[0]+11,p[1]+13);ag.closePath();ag.fill();
 ag.fillStyle='#ffe9a0';ag.beginPath();ag.moveTo(p[0]+16,p[1]+7);ag.lineTo(p[0]+19,p[1]+13);ag.lineTo(p[0]+13,p[1]+13);ag.closePath();ag.fill();
 ag.fillStyle='#fff6d8';ag.beginPath();ag.arc(p[0]+16,p[1]+11,1.6,0,7);ag.fill();})();
(function(){var p=tileXY(30);ag.fillStyle='#e8e6e0';ag.fillRect(p[0],p[1],TS,TS);  // 30 wool: soft white base + knit weave
 var wr2,wc2;
 for(wr2=0;wr2<TS;wr2+=4){                                    // subtle 4px knit rows
   ag.fillStyle=(wr2%8===0)?'#d5d2ca':'#f4f2ec';
   ag.fillRect(p[0],p[1]+wr2,TS,2);
 }
 for(wc2=0;wc2<TS;wc2+=4){                                    // vertical column speckle
   ag.fillStyle='#dddbd4';ag.fillRect(p[0]+wc2,p[1],1,TS);
 }
 for(var i9=0;i9<60;i9++){                                         // random knit speckles
   ag.fillStyle=(arand()<0.5)?'#d5d2ca':'#f4f2ec';
   ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+Math.floor(arand()*TS),2,2);
 }})();

// ----- FURNACE TILES (31-35) -----

// tile 34: furnace side — stone-gray cobbled texture with dark rectangular mouth + orange embers
(function(){var p=tileXY(34);ag.fillStyle='#7a7a7a';ag.fillRect(p[0],p[1],TS,TS);  // stone-gray base
 for(var i=0;i<160;i++){ag.fillStyle=(arand()<0.5)?'#6a6a6a':'#8a8a8a';ag.fillRect(p[0]+Math.floor(arand()*TS),p[1]+Math.floor(arand()*TS),2,2);}
 // dark rectangular mouth in the lower half
 ag.fillStyle='#1a1a1a';ag.fillRect(p[0]+9,p[1]+17,14,11);
 // dark border around mouth
 ag.fillStyle='#111111';ag.fillRect(p[0]+8,p[1]+16,16,1);ag.fillRect(p[0]+8,p[1]+28,16,1);
 ag.fillRect(p[0]+8,p[1]+16,1,13);ag.fillRect(p[0]+24,p[1]+16,1,13);
 // 3-4 orange ember pixels inside the mouth
 ag.fillStyle='#e87820';ag.fillRect(p[0]+11,p[1]+24,4,2);ag.fillRect(p[0]+17,p[1]+23,3,2);
 ag.fillStyle='#ffb040';ag.fillRect(p[0]+13,p[1]+25,3,1);ag.fillRect(p[0]+19,p[1]+24,2,1);
 ag.fillStyle='#ff6010';ag.fillRect(p[0]+12,p[1]+23,2,1);})();

// tile 35: furnace top — plain darker stone
speck(35,'#6a6a6a',['#5c5c5c','#787878','#636363'],200);         // 35 furnace top (plain darker stone)
