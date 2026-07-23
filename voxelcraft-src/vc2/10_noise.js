// MODULE 10: rng + noise (FROZEN - do not edit)
// ===== RNG / NOISE =====

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

