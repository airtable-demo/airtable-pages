
// ---------- 49_nooks.js (Porter: Dock Builder) ----------
// /nooks floating dock: left-side in-game panel + guaranteed-working popup dialer window.

var NOOKS_URL='https://app.nooks.in/workspaces/BgmZYqqdgcXM6pMS/settings/notifications?floorId=SUAIckPmRXjiji53';
var nooksDragging=false;
var nooksLoaded=false;
var nooksPopupRef=null;
var nooksResizing=false;
var nooksDragDX=0,nooksDragDY=0;
var nooksResizeStartX=0,nooksResizeStartY=0,nooksResizeStartW=0,nooksResizeStartH=0;

function nooksEl(){return document.getElementById('nooksPanel');}

function nooksVisible(){
 var el=nooksEl();
 return !!(el&&el.style.display==='flex');
}

var nooksAttemptTimer=null;
function nooksAttemptEmbed(){
 var frame=document.getElementById('nooksFrame');
 var ov=document.getElementById('nooksOverlay');
 var conn=document.getElementById('nooksConnecting');
 var exp=document.getElementById('nooksExplain');
 // Genuine in-page attempt: point the iframe at the real Nooks URL. The browser will
 // refuse it (frame-ancestors). We keep an opaque overlay on top the whole time so the
 // block never shows as a broken-file icon — 'show raw frame' lets you peek at the block.
 if(frame){try{frame.src=NOOKS_URL;}catch(e){}}
 if(ov)ov.classList.add('on');
 if(conn)conn.style.display='block';
 if(exp)exp.style.display='none';
 clearTimeout(nooksAttemptTimer);
 nooksAttemptTimer=setTimeout(function(){
  if(conn)conn.style.display='none';
  if(exp)exp.style.display='block';
 },1700);
}
function openNooks(){
 var el=nooksEl();
 if(!el)return;
 el.style.display='flex';
 nooksAttemptEmbed();
 if(typeof suppressNextUnlockPause==='function')suppressNextUnlockPause();
 try{document.exitPointerLock();}catch(e){}
 if(typeof addChatMsg==='function')addChatMsg('Nooks dock open','sys');
}

function closeNooks(){
 var el=nooksEl();
 if(!el)return;
 el.style.display='none';
 if(typeof tryLock==='function')tryLock();
}

function openNooksPopup(){
 if(nooksPopupRef&&!nooksPopupRef.closed){
  nooksPopupRef.focus();
  return;
 }
 var h=Math.min(920,(screen.availHeight||900)-70);
 nooksPopupRef=window.open(NOOKS_URL,'nooksDialer','popup=yes,width=430,height='+h+',left=8,top=56');
 if(typeof addChatMsg==='function')addChatMsg('Floating Nooks window opened on the left — log in there and dial while you play','sys');
}

function nooksClamp(){
 var el=nooksEl();
 if(!el)return;
 var w=el.offsetWidth,h=el.offsetHeight;
 var maxL=Math.max(0,window.innerWidth-w);
 var maxT=Math.max(0,window.innerHeight-h);
 var l=parseFloat(el.style.left)||0;
 var t=parseFloat(el.style.top)||0;
 l=Math.max(0,Math.min(maxL,l));
 t=Math.max(0,Math.min(maxT,t));
 el.style.left=l+'px';
 el.style.top=t+'px';
}

function nooksOnMouseMove(e){
 if(nooksDragging){
  var el=nooksEl();
  if(!el)return;
  var l=e.clientX-nooksDragDX;
  var t=e.clientY-nooksDragDY;
  var w=el.offsetWidth,h=el.offsetHeight;
  var maxL=Math.max(0,window.innerWidth-w);
  var maxT=Math.max(0,window.innerHeight-h);
  l=Math.max(0,Math.min(maxL,l));
  t=Math.max(0,Math.min(maxT,t));
  el.style.left=l+'px';
  el.style.top=t+'px';
  return;
 }
 if(nooksResizing){
  var el2=nooksEl();
  if(!el2)return;
  var dw=e.clientX-nooksResizeStartX;
  var dh=e.clientY-nooksResizeStartY;
  var nw=nooksResizeStartW+dw;
  var nh=nooksResizeStartH+dh;
  var maxW=window.innerWidth*0.92;
  var maxH=window.innerHeight*0.92;
  nw=Math.max(320,Math.min(maxW,nw));
  nh=Math.max(300,Math.min(maxH,nh));
  el2.style.width=nw+'px';
  el2.style.height=nh+'px';
  nooksClamp();
 }
}

function nooksOnMouseUp(){
 if(nooksDragging){
  nooksDragging=false;
  var frame=document.getElementById('nooksFrame');
  if(frame)frame.style.pointerEvents='';
 }
 if(nooksResizing){
  nooksResizing=false;
  var frame2=document.getElementById('nooksFrame');
  if(frame2)frame2.style.pointerEvents='';
 }
}

(function nooksInit(){
 var closeBtn=document.getElementById('nooksClose');
 if(closeBtn)closeBtn.addEventListener('click',function(e){e.stopPropagation();closeNooks();});
 var popBtn=document.getElementById('nooksPop');
 if(popBtn)popBtn.addEventListener('click',function(e){e.stopPropagation();openNooksPopup();});
 var openWinBtn=document.getElementById('nooksOpenWin');
 if(openWinBtn)openWinBtn.addEventListener('click',function(e){e.stopPropagation();openNooksPopup();});
 var rawBtn=document.getElementById('nooksRaw');
 if(rawBtn)rawBtn.addEventListener('click',function(e){e.stopPropagation();
  var ov=document.getElementById('nooksOverlay');if(ov)ov.classList.remove('on');
  if(typeof addChatMsg==='function')addChatMsg('Raw frame revealed — that blank/error area is Nooks refusing to embed. /nooks again to reset.','sys');});
 var head=document.getElementById('nooksHead');
 if(head){
  head.addEventListener('mousedown',function(e){
   if(e.target&&e.target.tagName==='BUTTON')return;
   var el=nooksEl();
   if(!el)return;
   nooksDragging=true;
   var rect=el.getBoundingClientRect();
   el.style.left=rect.left+'px';
   el.style.top=rect.top+'px';
   el.style.right='auto';
   el.style.bottom='auto';
   nooksDragDX=e.clientX-rect.left;
   nooksDragDY=e.clientY-rect.top;
   var frame=document.getElementById('nooksFrame');
   if(frame)frame.style.pointerEvents='none';
   e.preventDefault();
  });
 }
 var resize=document.getElementById('nooksResize');
 if(resize){
  resize.addEventListener('mousedown',function(e){
   var el=nooksEl();
   if(!el)return;
   nooksResizing=true;
   nooksResizeStartX=e.clientX;
   nooksResizeStartY=e.clientY;
   nooksResizeStartW=el.offsetWidth;
   nooksResizeStartH=el.offsetHeight;
   var frame=document.getElementById('nooksFrame');
   if(frame)frame.style.pointerEvents='none';
   e.preventDefault();
   e.stopPropagation();
  });
 }
 document.addEventListener('mousemove',nooksOnMouseMove);
 document.addEventListener('mouseup',nooksOnMouseUp);
})();
