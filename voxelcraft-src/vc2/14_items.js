// MODULE 14: item registry + item icon atlas painters (OWNER: Pigment)
// ===== ITEM ATLAS =====
// 8x4 grid of 32px tiles => 256x128 canvas, transparent background, chunky pixel-art icons.
// Icon index layout with ICOLS=8:
//   row0: indices 0-7   (pixel y=0)
//   row1: indices 8-15  (pixel y=32)
//   row2: indices 16-23 (pixel y=64)
//   row3: indices 24-31 (pixel y=96)
// Existing icons keep their same index numbers; itileXY recomputes pixel coords automatically.

var ITS=32, ICOLS=8, itemAtlasC=document.createElement('canvas');itemAtlasC.width=ITS*ICOLS;itemAtlasC.height=ITS*5;
var ig=itemAtlasC.getContext('2d');
var irand=mulberry32(777);
function itileXY(t){return [ (t%ICOLS)*ITS, Math.floor(t/ICOLS)*ITS ];}

// clear whole atlas first so untouched tiles stay fully transparent
ig.clearRect(0,0,itemAtlasC.width,itemAtlasC.height);

// ----- tile0: STICK (diagonal brown stick) -----
(function(){var p=itileXY(0);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#8a6a3d';
 ig.fillRect(p[0]+6,p[1]+22,4,4);ig.fillRect(p[0]+10,p[1]+18,4,4);ig.fillRect(p[0]+14,p[1]+14,4,4);
 ig.fillRect(p[0]+18,p[1]+10,4,4);ig.fillRect(p[0]+22,p[1]+6,4,4);
 ig.fillStyle='#6e5230';
 ig.fillRect(p[0]+6,p[1]+24,4,2);ig.fillRect(p[0]+10,p[1]+20,4,2);ig.fillRect(p[0]+14,p[1]+16,4,2);
 ig.fillRect(p[0]+18,p[1]+12,4,2);ig.fillRect(p[0]+22,p[1]+8,4,2);
 ig.fillStyle='#a9865a';
 ig.fillRect(p[0]+7,p[1]+22,2,2);ig.fillRect(p[0]+19,p[1]+10,2,2);})();

// ----- tile1: PORKCHOP (meat lobe pink/brown + bone-white end) -----
(function(){var p=itileXY(1);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#c96b6b';
 ig.fillRect(p[0]+8,p[1]+8,14,4);ig.fillRect(p[0]+6,p[1]+12,16,4);ig.fillRect(p[0]+6,p[1]+16,14,4);
 ig.fillRect(p[0]+8,p[1]+20,10,4);
 ig.fillStyle='#8f4a42';
 ig.fillRect(p[0]+8,p[1]+8,14,2);ig.fillRect(p[0]+6,p[1]+16,14,2);ig.fillRect(p[0]+10,p[1]+22,6,2);
 ig.fillStyle='#e2938a';
 ig.fillRect(p[0]+10,p[1]+10,4,2);ig.fillRect(p[0]+14,p[1]+14,4,2);
 ig.fillStyle='#f4ecd8';
 ig.fillRect(p[0]+20,p[1]+18,6,4);ig.fillRect(p[0]+24,p[1]+16,4,4);
 ig.fillStyle='#d8cba8';
 ig.fillRect(p[0]+22,p[1]+20,4,2);})();

// ----- tile2: APPLE (red round + tiny green leaf + stem) -----
(function(){var p=itileXY(2);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#cc3327';
 ig.fillRect(p[0]+10,p[1]+10,12,4);ig.fillRect(p[0]+8,p[1]+14,16,4);ig.fillRect(p[0]+8,p[1]+18,16,4);
 ig.fillRect(p[0]+10,p[1]+22,12,3);
 ig.fillStyle='#a3251c';
 ig.fillRect(p[0]+8,p[1]+18,16,2);ig.fillRect(p[0]+10,p[1]+22,12,2);
 ig.fillStyle='#e8695c';
 ig.fillRect(p[0]+11,p[1]+11,4,3);ig.fillRect(p[0]+9,p[1]+15,3,3);
 ig.fillStyle='#5a3a22';
 ig.fillRect(p[0]+15,p[1]+7,2,4);
 ig.fillStyle='#3f8a35';
 ig.fillRect(p[0]+17,p[1]+7,5,3);})();

// ----- tile3-6: PICKAXES (shared silhouette, head color per tier) -----
function drawPickTile(t,headCol,headHi){
 var p=itileXY(t);ig.clearRect(p[0],p[1],ITS,ITS);
 // handle: diagonal brown stick
 ig.fillStyle='#8a6a3d';
 ig.fillRect(p[0]+7,p[1]+23,4,4);ig.fillRect(p[0]+11,p[1]+19,4,4);ig.fillRect(p[0]+15,p[1]+15,4,4);
 ig.fillRect(p[0]+19,p[1]+11,4,4);
 ig.fillStyle='#6e5230';
 ig.fillRect(p[0]+7,p[1]+25,4,2);ig.fillRect(p[0]+11,p[1]+21,4,2);ig.fillRect(p[0]+15,p[1]+17,4,2);
 // curved head across the top, centered near handle top
 ig.fillStyle=headCol;
 ig.fillRect(p[0]+9,p[1]+9,6,4);ig.fillRect(p[0]+15,p[1]+7,4,4);ig.fillRect(p[0]+19,p[1]+7,6,4);
 ig.fillRect(p[0]+13,p[1]+11,4,4);ig.fillRect(p[0]+21,p[1]+9,4,4);
 ig.fillStyle=headHi;
 ig.fillRect(p[0]+15,p[1]+7,4,2);ig.fillRect(p[0]+19,p[1]+7,4,2);
 ig.fillStyle='#000000';
 ig.globalAlpha=0.25;
 ig.fillRect(p[0]+9,p[1]+11,6,2);ig.fillRect(p[0]+21,p[1]+11,4,2);
 ig.globalAlpha=1;
}
drawPickTile(3,'#8a6a3d','#a9865a'); // wood
drawPickTile(4,'#9a9a9a','#c3c3c3'); // stone
drawPickTile(5,'#d8d8d8','#f4f4f4'); // iron
drawPickTile(6,'#4fd8d2','#9df3ef'); // diamond

// ----- tile7: AXE (handle + single-side blade) -----
(function(){var p=itileXY(7);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#8a6a3d';
 ig.fillRect(p[0]+7,p[1]+23,4,4);ig.fillRect(p[0]+11,p[1]+19,4,4);ig.fillRect(p[0]+15,p[1]+15,4,4);
 ig.fillRect(p[0]+19,p[1]+11,4,4);
 ig.fillStyle='#6e5230';
 ig.fillRect(p[0]+7,p[1]+25,4,2);ig.fillRect(p[0]+11,p[1]+21,4,2);ig.fillRect(p[0]+15,p[1]+17,4,2);
 // blade: single-sided wedge on one side of the handle top
 ig.fillStyle='#c8c8c8';
 ig.fillRect(p[0]+19,p[1]+5,8,4);ig.fillRect(p[0]+23,p[1]+9,6,4);ig.fillRect(p[0]+21,p[1]+13,4,4);
 ig.fillStyle='#eaeaea';
 ig.fillRect(p[0]+19,p[1]+5,8,2);
 ig.fillStyle='#8f8f8f';
 ig.fillRect(p[0]+23,p[1]+11,6,2);ig.fillRect(p[0]+21,p[1]+15,4,2);})();

// ----- tile8: SHOVEL (handle + rounded scoop) -----
(function(){var p=itileXY(8);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#8a6a3d';
 ig.fillRect(p[0]+7,p[1]+23,4,4);ig.fillRect(p[0]+11,p[1]+19,4,4);ig.fillRect(p[0]+15,p[1]+15,4,4);
 ig.fillRect(p[0]+18,p[1]+11,4,4);
 ig.fillStyle='#6e5230';
 ig.fillRect(p[0]+7,p[1]+25,4,2);ig.fillRect(p[0]+11,p[1]+21,4,2);
 // rounded scoop head
 ig.fillStyle='#b7b7b7';
 ig.fillRect(p[0]+18,p[1]+6,8,4);ig.fillRect(p[0]+16,p[1]+9,4,4);ig.fillRect(p[0]+26,p[1]+9,4,4);
 ig.fillRect(p[0]+17,p[1]+12,10,3);
 ig.fillStyle='#dadada';
 ig.fillRect(p[0]+18,p[1]+6,8,2);
 ig.fillStyle='#8f8f8f';
 ig.fillRect(p[0]+17,p[1]+13,10,2);})();

// ----- tile9: STONE SWORD (diagonal light-gray blade + brown hilt + guard) -----
(function(){var p=itileXY(9);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#d8d8d8';
 ig.fillRect(p[0]+21,p[1]+5,4,4);ig.fillRect(p[0]+17,p[1]+9,4,4);ig.fillRect(p[0]+13,p[1]+13,4,4);
 ig.fillRect(p[0]+9,p[1]+17,4,4);
 ig.fillStyle='#f4f4f4';
 ig.fillRect(p[0]+21,p[1]+5,2,4);ig.fillRect(p[0]+17,p[1]+9,2,4);
 // guard (crosspiece), perpendicular-ish accent near hilt
 ig.fillStyle='#8a6a3d';
 ig.fillRect(p[0]+6,p[1]+19,6,3);ig.fillRect(p[0]+11,p[1]+15,3,6);
 // hilt handle
 ig.fillStyle='#6e5230';
 ig.fillRect(p[0]+5,p[1]+21,6,4);
 ig.fillStyle='#5a4326';
 ig.fillRect(p[0]+5,p[1]+24,6,1);})();

// ----- tile10: BEEF (steak: red-brown slab + marbling streaks) -----
(function(){var p=itileXY(10);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#7a3d22';                                           // dark outer border
 ig.fillRect(p[0]+7,p[1]+10,18,14);
 ig.fillStyle='#b05030';                                           // main meat body
 ig.fillRect(p[0]+8,p[1]+11,16,12);
 ig.fillStyle='#6e2c14';                                           // darker shading bottom
 ig.fillRect(p[0]+8,p[1]+19,16,4);
 ig.fillStyle='#c47050';                                           // lighter highlight top
 ig.fillRect(p[0]+9,p[1]+12,14,3);
 ig.fillStyle='#d8a888';                                           // marbling streaks
 ig.fillRect(p[0]+10,p[1]+14,4,2);ig.fillRect(p[0]+17,p[1]+16,5,2);ig.fillRect(p[0]+12,p[1]+18,3,2);
 ig.fillStyle='#e8c8a8';                                           // bright marbling accents
 ig.fillRect(p[0]+11,p[1]+14,2,1);ig.fillRect(p[0]+18,p[1]+16,2,1);})();

// ----- tile11: CHICKEN (drumstick: tan meat lobe + white bone end) -----
(function(){var p=itileXY(11);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#b89060';                                           // meat lobe base tan
 ig.fillRect(p[0]+9,p[1]+9,14,6);ig.fillRect(p[0]+7,p[1]+15,16,6);ig.fillRect(p[0]+9,p[1]+21,12,4);
 ig.fillStyle='#8a6640';                                           // darker shading
 ig.fillRect(p[0]+9,p[1]+23,12,2);ig.fillRect(p[0]+7,p[1]+19,16,2);
 ig.fillStyle='#d4b484';                                           // lighter highlight top of lobe
 ig.fillRect(p[0]+10,p[1]+10,10,3);ig.fillRect(p[0]+8,p[1]+15,6,3);
 ig.fillStyle='#f0ece0';                                           // bone shaft (white-ish)
 ig.fillRect(p[0]+20,p[1]+14,5,12);
 ig.fillStyle='#e0dcd0';                                           // bone shadow side
 ig.fillRect(p[0]+24,p[1]+14,1,12);
 ig.fillStyle='#f4f0e4';                                           // bone knob top
 ig.fillRect(p[0]+18,p[1]+12,6,4);ig.fillRect(p[0]+19,p[1]+10,4,4);
 ig.fillStyle='#ddd8cc';                                           // bone knob shading
 ig.fillRect(p[0]+18,p[1]+14,2,2);ig.fillRect(p[0]+22,p[1]+14,2,2);})();

// ----- NEW ICONS (indices 12+) -----

// ----- tile12: IRON_INGOT (two stacked silver-gray bars + highlight edge) -----
(function(){var p=itileXY(12);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#9a9a9a';                                           // main silver-gray top bar
 ig.fillRect(p[0]+6,p[1]+9,20,8);
 ig.fillStyle='#bdbdbd';                                           // highlight edge top bar
 ig.fillRect(p[0]+6,p[1]+9,20,2);ig.fillRect(p[0]+6,p[1]+9,2,8);
 ig.fillStyle='#6e6e6e';                                           // shadow bottom/right top bar
 ig.fillRect(p[0]+6,p[1]+15,20,2);ig.fillRect(p[0]+24,p[1]+9,2,8);
 ig.fillStyle='#9a9a9a';                                           // main silver-gray bottom bar
 ig.fillRect(p[0]+6,p[1]+19,20,8);
 ig.fillStyle='#bdbdbd';                                           // highlight edge bottom bar
 ig.fillRect(p[0]+6,p[1]+19,20,2);ig.fillRect(p[0]+6,p[1]+19,2,8);
 ig.fillStyle='#6e6e6e';                                           // shadow bottom/right bottom bar
 ig.fillRect(p[0]+6,p[1]+25,20,2);ig.fillRect(p[0]+24,p[1]+19,2,8);
 ig.fillStyle='#d8d8d8';                                           // bright sparkle highlight
 ig.fillRect(p[0]+8,p[1]+11,3,2);ig.fillRect(p[0]+8,p[1]+21,3,2);})();

// ----- tile13: GOLD_INGOT (same shape, warm gold) -----
(function(){var p=itileXY(13);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#e8a820';                                           // main warm gold top bar
 ig.fillRect(p[0]+6,p[1]+9,20,8);
 ig.fillStyle='#ffd040';                                           // highlight edge top bar
 ig.fillRect(p[0]+6,p[1]+9,20,2);ig.fillRect(p[0]+6,p[1]+9,2,8);
 ig.fillStyle='#b07810';                                           // shadow bottom/right top bar
 ig.fillRect(p[0]+6,p[1]+15,20,2);ig.fillRect(p[0]+24,p[1]+9,2,8);
 ig.fillStyle='#e8a820';                                           // main warm gold bottom bar
 ig.fillRect(p[0]+6,p[1]+19,20,8);
 ig.fillStyle='#ffd040';                                           // highlight edge bottom bar
 ig.fillRect(p[0]+6,p[1]+19,20,2);ig.fillRect(p[0]+6,p[1]+19,2,8);
 ig.fillStyle='#b07810';                                           // shadow bottom/right bottom bar
 ig.fillRect(p[0]+6,p[1]+25,20,2);ig.fillRect(p[0]+24,p[1]+19,2,8);
 ig.fillStyle='#ffe880';                                           // bright sparkle highlight
 ig.fillRect(p[0]+8,p[1]+11,3,2);ig.fillRect(p[0]+8,p[1]+21,3,2);})();

// ----- tile14: DIAMOND (cyan gem, faceted diamond silhouette + white sparkle) -----
(function(){var p=itileXY(14);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#3fd8d8';                                           // main cyan gem body
 ig.fillRect(p[0]+10,p[1]+12,12,4);ig.fillRect(p[0]+8,p[1]+16,16,4);ig.fillRect(p[0]+10,p[1]+20,12,4);
 // top facet point
 ig.fillStyle='#3fd8d8';ig.fillRect(p[0]+13,p[1]+9,6,4);
 // bottom point taper
 ig.fillRect(p[0]+12,p[1]+23,8,3);ig.fillRect(p[0]+14,p[1]+25,4,3);
 ig.fillStyle='#8ff5f5';                                           // highlight upper-left facet
 ig.fillRect(p[0]+10,p[1]+12,5,2);ig.fillRect(p[0]+13,p[1]+9,3,3);
 ig.fillStyle='#20a8a8';                                           // shadow lower-right facet
 ig.fillRect(p[0]+18,p[1]+18,5,2);ig.fillRect(p[0]+16,p[1]+22,5,2);
 ig.fillStyle='#ffffff';                                           // white sparkle
 ig.fillRect(p[0]+12,p[1]+13,2,2);ig.fillRect(p[0]+11,p[1]+12,1,1);})();

// ----- tile15: COAL (irregular black lump + gray facets) -----
(function(){var p=itileXY(15);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#1e1e1e';                                           // black lump base
 ig.fillRect(p[0]+8,p[1]+10,16,4);ig.fillRect(p[0]+6,p[1]+14,20,8);ig.fillRect(p[0]+8,p[1]+22,16,4);
 ig.fillRect(p[0]+10,p[1]+8,12,3);ig.fillRect(p[0]+10,p[1]+24,12,3);
 ig.fillStyle='#3a3a3a';                                           // gray facet highlights
 ig.fillRect(p[0]+9,p[1]+11,4,3);ig.fillRect(p[0]+18,p[1]+14,5,3);ig.fillRect(p[0]+10,p[1]+20,3,3);
 ig.fillStyle='#555555';                                           // lighter gray accent
 ig.fillRect(p[0]+10,p[1]+12,2,2);ig.fillRect(p[0]+20,p[1]+15,2,2);
 ig.fillStyle='#0a0a0a';                                           // very dark edge detail
 ig.fillRect(p[0]+8,p[1]+10,16,1);ig.fillRect(p[0]+6,p[1]+22,20,1);})();

// ----- tile16: IRON_SWORD (bright silver blade + brown hilt + guard) -----
(function(){var p=itileXY(16);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#e0e0e0';                                           // bright silver blade
 ig.fillRect(p[0]+21,p[1]+5,4,4);ig.fillRect(p[0]+17,p[1]+9,4,4);ig.fillRect(p[0]+13,p[1]+13,4,4);
 ig.fillRect(p[0]+9,p[1]+17,4,4);
 ig.fillStyle='#ffffff';                                           // bright highlight edge
 ig.fillRect(p[0]+21,p[1]+5,2,4);ig.fillRect(p[0]+17,p[1]+9,2,4);ig.fillRect(p[0]+13,p[1]+13,2,2);
 ig.fillStyle='#a0a0a0';                                           // shadow edge
 ig.fillRect(p[0]+23,p[1]+7,2,2);ig.fillRect(p[0]+19,p[1]+11,2,2);
 // guard (crosspiece)
 ig.fillStyle='#8a6a3d';
 ig.fillRect(p[0]+6,p[1]+19,6,3);ig.fillRect(p[0]+11,p[1]+15,3,6);
 // hilt handle
 ig.fillStyle='#6e5230';
 ig.fillRect(p[0]+5,p[1]+21,6,4);
 ig.fillStyle='#5a4326';
 ig.fillRect(p[0]+5,p[1]+24,6,1);})();

// ----- tile17: STEAK (browner cooked version of beef slab) -----
(function(){var p=itileXY(17);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#4a2010';                                           // dark outer border (browned)
 ig.fillRect(p[0]+7,p[1]+10,18,14);
 ig.fillStyle='#7a3c18';                                           // main cooked meat body
 ig.fillRect(p[0]+8,p[1]+11,16,12);
 ig.fillStyle='#3a1608';                                           // darker shading bottom
 ig.fillRect(p[0]+8,p[1]+19,16,4);
 ig.fillStyle='#9a5428';                                           // lighter highlight top
 ig.fillRect(p[0]+9,p[1]+12,14,3);
 ig.fillStyle='#b87840';                                           // cooked surface striping
 ig.fillRect(p[0]+10,p[1]+14,4,2);ig.fillRect(p[0]+17,p[1]+16,5,2);ig.fillRect(p[0]+12,p[1]+18,3,2);
 ig.fillStyle='#d0a060';                                           // bright highlight accents
 ig.fillRect(p[0]+11,p[1]+14,2,1);ig.fillRect(p[0]+18,p[1]+16,2,1);})();

// ----- tile18: COOKED_CHICKEN (golden-brown drumstick) -----
(function(){var p=itileXY(18);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#8a6030';                                           // golden-brown meat base
 ig.fillRect(p[0]+9,p[1]+9,14,6);ig.fillRect(p[0]+7,p[1]+15,16,6);ig.fillRect(p[0]+9,p[1]+21,12,4);
 ig.fillStyle='#5a3c18';                                           // darker shading (cooked)
 ig.fillRect(p[0]+9,p[1]+23,12,2);ig.fillRect(p[0]+7,p[1]+19,16,2);
 ig.fillStyle='#c09050';                                           // lighter highlight top
 ig.fillRect(p[0]+10,p[1]+10,10,3);ig.fillRect(p[0]+8,p[1]+15,6,3);
 ig.fillStyle='#d4a860';                                           // golden-brown highlight streak
 ig.fillRect(p[0]+11,p[1]+12,5,2);
 ig.fillStyle='#f0ece0';                                           // bone shaft (white-ish)
 ig.fillRect(p[0]+20,p[1]+14,5,12);
 ig.fillStyle='#e0dcd0';                                           // bone shadow side
 ig.fillRect(p[0]+24,p[1]+14,1,12);
 ig.fillStyle='#f4f0e4';                                           // bone knob top
 ig.fillRect(p[0]+18,p[1]+12,6,4);ig.fillRect(p[0]+19,p[1]+10,4,4);
 ig.fillStyle='#ddd8cc';                                           // bone knob shading
 ig.fillRect(p[0]+18,p[1]+14,2,2);ig.fillRect(p[0]+22,p[1]+14,2,2);})();

// ----- tile19: COOKED_PORKCHOP (browned chop) -----
(function(){var p=itileXY(19);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#7a4828';                                           // browned main lobe
 ig.fillRect(p[0]+8,p[1]+8,14,4);ig.fillRect(p[0]+6,p[1]+12,16,4);ig.fillRect(p[0]+6,p[1]+16,14,4);
 ig.fillRect(p[0]+8,p[1]+20,10,4);
 ig.fillStyle='#4a2810';                                           // dark shadow edges
 ig.fillRect(p[0]+8,p[1]+8,14,2);ig.fillRect(p[0]+6,p[1]+16,14,2);ig.fillRect(p[0]+10,p[1]+22,6,2);
 ig.fillStyle='#b07040';                                           // lighter highlight
 ig.fillRect(p[0]+10,p[1]+10,4,2);ig.fillRect(p[0]+14,p[1]+14,4,2);
 ig.fillStyle='#f4ecd8';                                           // bone end (white)
 ig.fillRect(p[0]+20,p[1]+18,6,4);ig.fillRect(p[0]+24,p[1]+16,4,4);
 ig.fillStyle='#d8cba8';                                           // bone shading
 ig.fillRect(p[0]+22,p[1]+20,4,2);})();

// ----- tile20: GOLDEN_APPLE (gold apple with white sparkle pixels) -----
(function(){var p=itileXY(20);ig.clearRect(p[0],p[1],ITS,ITS);
 ig.fillStyle='#e8a820';                                           // gold apple body
 ig.fillRect(p[0]+10,p[1]+10,12,4);ig.fillRect(p[0]+8,p[1]+14,16,4);ig.fillRect(p[0]+8,p[1]+18,16,4);
 ig.fillRect(p[0]+10,p[1]+22,12,3);
 ig.fillStyle='#b07810';                                           // darker shading bottom
 ig.fillRect(p[0]+8,p[1]+18,16,2);ig.fillRect(p[0]+10,p[1]+22,12,2);
 ig.fillStyle='#ffd040';                                           // bright gold highlight
 ig.fillRect(p[0]+11,p[1]+11,4,3);ig.fillRect(p[0]+9,p[1]+15,3,3);
 ig.fillStyle='#5a3a22';                                           // stem
 ig.fillRect(p[0]+15,p[1]+7,2,4);
 ig.fillStyle='#3f8a35';                                           // leaf
 ig.fillRect(p[0]+17,p[1]+7,5,3);
 // white sparkle pixels
 ig.fillStyle='#ffffff';
 ig.fillRect(p[0]+12,p[1]+12,2,2);ig.fillRect(p[0]+21,p[1]+15,2,1);ig.fillRect(p[0]+10,p[1]+19,1,2);})();

// ===== ITEM REGISTRY (EXACT harness ids) =====
var ITEMS={};
ITEMS[100]={n:'Stick',icon:0};
ITEMS[101]={n:'Porkchop',icon:1,food:8};
ITEMS[102]={n:'Apple',icon:2,food:4};
ITEMS[110]={n:'Wooden Pickaxe',icon:3,tool:'pick',tier:1};
ITEMS[111]={n:'Stone Pickaxe',icon:4,tool:'pick',tier:2};
ITEMS[112]={n:'Iron Pickaxe',icon:5,tool:'pick',tier:3};
ITEMS[113]={n:'Diamond Pickaxe',icon:6,tool:'pick',tier:4};
ITEMS[114]={n:'Wooden Axe',icon:7,tool:'axe',tier:1};
ITEMS[115]={n:'Wooden Shovel',icon:8,tool:'shovel',tier:1};
ITEMS[116]={n:'Stone Sword',icon:9,tool:'sword',tier:2};
ITEMS[103]={n:'Beef',icon:10,food:8};
ITEMS[104]={n:'Chicken',icon:11,food:5};

// ----- V6 new items -----
var IRON_INGOT=105; ITEMS[105]={n:'Iron Ingot',icon:12};
var GOLD_INGOT=106; ITEMS[106]={n:'Gold Ingot',icon:13};
var DIAMOND=107;    ITEMS[107]={n:'Diamond',icon:14};
var COAL=108;       ITEMS[108]={n:'Coal',icon:15};
var IRON_SWORD=117; ITEMS[117]={n:'Iron Sword',icon:16,tool:'sword',tier:3};
var STEAK=120;      ITEMS[120]={n:'Steak',icon:17,food:10};
var COOKED_CHICKEN=121; ITEMS[121]={n:'Cooked Chicken',icon:18,food:8};
var COOKED_PORKCHOP=122; ITEMS[122]={n:'Cooked Porkchop',icon:19,food:10};
var GOLDEN_APPLE=123; ITEMS[123]={n:'Golden Apple',icon:20,food:20,heal:20};

// ===== V7 ARMOR ICONS (indices 21-32, rows 2-3-4 of the 8x5 atlas) =====

// Helper: draw a helmet icon at atlas tile t with main color mc and shade color sc
function drawArmorHelmTile(t,mc,sc){
 var p=itileXY(t);ig.clearRect(p[0],p[1],ITS,ITS);
 // dome outer top
 ig.fillStyle=mc;
 ig.fillRect(p[0]+8,p[1]+6,16,4);
 ig.fillRect(p[0]+6,p[1]+10,20,4);
 ig.fillRect(p[0]+6,p[1]+14,20,8);
 ig.fillRect(p[0]+6,p[1]+22,6,4);
 ig.fillRect(p[0]+20,p[1]+22,6,4);
 // eye slot gap (transparent) = clearRect across middle
 ig.clearRect(p[0]+12,p[1]+18,8,4);
 // shading strip on right and bottom
 ig.fillStyle=sc;
 ig.fillRect(p[0]+22,p[1]+10,4,4);
 ig.fillRect(p[0]+22,p[1]+14,4,8);
 ig.fillRect(p[0]+6,p[1]+22,4,4);
 ig.fillRect(p[0]+22,p[1]+22,4,4);
 // highlight strip on left and top
 ig.fillStyle='#ffffff';
 ig.globalAlpha=0.18;
 ig.fillRect(p[0]+8,p[1]+6,16,2);
 ig.fillRect(p[0]+6,p[1]+10,2,12);
 ig.globalAlpha=1;
}

// Helper: draw a chestplate icon at atlas tile t
function drawArmorChestTile(t,mc,sc){
 var p=itileXY(t);ig.clearRect(p[0],p[1],ITS,ITS);
 // shoulder caps left & right
 ig.fillStyle=mc;
 ig.fillRect(p[0]+2,p[1]+6,8,8);
 ig.fillRect(p[0]+22,p[1]+6,8,8);
 // central torso neck notch
 ig.fillRect(p[0]+10,p[1]+8,12,4);
 // main torso body
 ig.fillRect(p[0]+4,p[1]+14,24,14);
 // shading right side & bottom
 ig.fillStyle=sc;
 ig.fillRect(p[0]+26,p[1]+14,2,14);
 ig.fillRect(p[0]+22,p[1]+6,2,8);
 ig.fillRect(p[0]+4,p[1]+26,24,2);
 // highlight
 ig.fillStyle='#ffffff';
 ig.globalAlpha=0.18;
 ig.fillRect(p[0]+4,p[1]+14,2,14);
 ig.fillRect(p[0]+2,p[1]+6,2,8);
 ig.fillRect(p[0]+10,p[1]+8,12,2);
 ig.globalAlpha=1;
}

// Helper: draw leggings icon at atlas tile t
function drawArmorLegsTile(t,mc,sc){
 var p=itileXY(t);ig.clearRect(p[0],p[1],ITS,ITS);
 // waistband
 ig.fillStyle=mc;
 ig.fillRect(p[0]+4,p[1]+5,24,5);
 // left leg
 ig.fillRect(p[0]+4,p[1]+10,10,18);
 // right leg
 ig.fillRect(p[0]+18,p[1]+10,10,18);
 // crotch gap (transparent)
 ig.clearRect(p[0]+14,p[1]+10,4,6);
 // shading
 ig.fillStyle=sc;
 ig.fillRect(p[0]+12,p[1]+10,2,18);
 ig.fillRect(p[0]+26,p[1]+10,2,18);
 ig.fillRect(p[0]+4,p[1]+26,10,2);
 ig.fillRect(p[0]+18,p[1]+26,10,2);
 // highlight
 ig.fillStyle='#ffffff';
 ig.globalAlpha=0.18;
 ig.fillRect(p[0]+4,p[1]+5,24,2);
 ig.fillRect(p[0]+4,p[1]+10,2,16);
 ig.fillRect(p[0]+18,p[1]+10,2,16);
 ig.globalAlpha=1;
}

// Helper: draw boots icon at atlas tile t
function drawArmorBootsTile(t,mc,sc){
 var p=itileXY(t);ig.clearRect(p[0],p[1],ITS,ITS);
 // left boot
 ig.fillStyle=mc;
 ig.fillRect(p[0]+2,p[1]+8,10,14);
 ig.fillRect(p[0]+2,p[1]+22,12,5);
 // right boot
 ig.fillRect(p[0]+20,p[1]+8,10,14);
 ig.fillRect(p[0]+18,p[1]+22,12,5);
 // shading
 ig.fillStyle=sc;
 ig.fillRect(p[0]+10,p[1]+8,2,14);
 ig.fillRect(p[0]+2,p[1]+25,12,2);
 ig.fillRect(p[0]+28,p[1]+8,2,14);
 ig.fillRect(p[0]+18,p[1]+25,12,2);
 // highlight
 ig.fillStyle='#ffffff';
 ig.globalAlpha=0.18;
 ig.fillRect(p[0]+2,p[1]+8,2,14);
 ig.fillRect(p[0]+20,p[1]+8,2,14);
 ig.globalAlpha=1;
}

// Iron armor: indices 21-24 (row2 slots 5-7 + row3 slot 0)
drawArmorHelmTile(21,'#d8d8d8','#9a9a9a');
drawArmorChestTile(22,'#d8d8d8','#9a9a9a');
drawArmorLegsTile(23,'#d8d8d8','#9a9a9a');
drawArmorBootsTile(24,'#d8d8d8','#9a9a9a');

// Gold armor: indices 25-28
drawArmorHelmTile(25,'#e8c84a','#b8983a');
drawArmorChestTile(26,'#e8c84a','#b8983a');
drawArmorLegsTile(27,'#e8c84a','#b8983a');
drawArmorBootsTile(28,'#e8c84a','#b8983a');

// Diamond armor: indices 29-32
drawArmorHelmTile(29,'#4fd8d2','#2fa8a2');
drawArmorChestTile(30,'#4fd8d2','#2fa8a2');
drawArmorLegsTile(31,'#4fd8d2','#2fa8a2');
drawArmorBootsTile(32,'#4fd8d2','#2fa8a2');

// ===== V7 ARMOR ITEMS =====
var IRON_HELM=130;  ITEMS[130]={n:'Iron Helmet',   icon:21,armor:2,slot:'helm'};
var IRON_CHEST=131; ITEMS[131]={n:'Iron Chestplate',icon:22,armor:6,slot:'chest'};
var IRON_LEGS=132;  ITEMS[132]={n:'Iron Leggings',  icon:23,armor:5,slot:'legs'};
var IRON_BOOTS=133; ITEMS[133]={n:'Iron Boots',     icon:24,armor:2,slot:'boots'};
var GOLD_HELM=134;  ITEMS[134]={n:'Gold Helmet',    icon:25,armor:2,slot:'helm'};
var GOLD_CHEST=135; ITEMS[135]={n:'Gold Chestplate',icon:26,armor:5,slot:'chest'};
var GOLD_LEGS=136;  ITEMS[136]={n:'Gold Leggings',  icon:27,armor:3,slot:'legs'};
var GOLD_BOOTS=137; ITEMS[137]={n:'Gold Boots',     icon:28,armor:1,slot:'boots'};
var DIA_HELM=138;   ITEMS[138]={n:'Diamond Helmet',   icon:29,armor:3,slot:'helm'};
var DIA_CHEST=139;  ITEMS[139]={n:'Diamond Chestplate',icon:30,armor:8,slot:'chest'};
var DIA_LEGS=140;   ITEMS[140]={n:'Diamond Leggings',  icon:31,armor:6,slot:'legs'};
var DIA_BOOTS=141;  ITEMS[141]={n:'Diamond Boots',     icon:32,armor:3,slot:'boots'};

// ===== HELPERS =====
function isBlockId(id){return typeof id==='number'&&id>0&&id<100;}

function drawItemIcon(g2,id,dx,dy,size){
 var it=ITEMS[id];if(!it)return;
 var c=it.icon%ICOLS,r=Math.floor(it.icon/ICOLS);
 g2.imageSmoothingEnabled=false;
 g2.drawImage(itemAtlasC,c*ITS,r*ITS,ITS,ITS,dx,dy,size,size);
}

// optional: draw either a block tile (via atlasC) or an item icon (via itemAtlasC) at (dx,dy,size)
function iconAny(g2,id,size){
 g2.imageSmoothingEnabled=false;
 if(isBlockId(id)){
  if(typeof BLOCKS!=='undefined'&&typeof atlasC!=='undefined'&&typeof tileXY==='function'&&typeof TS!=='undefined'){
   var B=BLOCKS[id];if(!B)return;
   var t=B.t[2];var xy=tileXY(t);
   g2.drawImage(atlasC,xy[0],xy[1],TS,TS,0,0,size,size);
  }
 }else{
  drawItemIcon(g2,id,0,0,size);
 }
}
