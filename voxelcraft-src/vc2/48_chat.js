// ===== 48_chat.js — Herald: Minecraft-style chat console + command set =====
// Top-level: declarations + lazy DOM refs only. No side effects beyond wiring.

var chatWrapEl=null,chatLineEl=null,chatLogEl=null;
var chatOpen=false;
var chatMsgs=[]; // {el, t} — timers for fade/removal
var CHAT_MAX=10;
var CHAT_FADE_MS=7000,CHAT_REMOVE_MS=8000;

function chatEls(){
 if(!chatWrapEl)chatWrapEl=document.getElementById('chatwrap');
 if(!chatLineEl)chatLineEl=document.getElementById('chatline');
 if(!chatLogEl)chatLogEl=document.getElementById('chatlog');
}

function isChatOpen(){return chatOpen;}

function openChat(prefill){
 if(state!=='play')return;
 chatEls();
 if(typeof clearKeys==='function')clearKeys();
 mining=false;
 chatOpen=true;
 // keep all current messages fully visible while chat is open
 for(var i=0;i<chatMsgs.length;i++){
  if(chatMsgs[i].el)chatMsgs[i].el.style.opacity='1';
 }
 if(chatWrapEl)chatWrapEl.style.display='block';
 if(chatLineEl){
  chatLineEl.value=(typeof prefill==='string')?prefill:'';
  chatLineEl.focus();
  var vlen=chatLineEl.value.length;
  try{chatLineEl.setSelectionRange(vlen,vlen);}catch(e){}
 }
 if(typeof suppressNextUnlockPause==='function')suppressNextUnlockPause();
 try{document.exitPointerLock();}catch(e){}
}

function closeChat(){
 chatEls();
 chatOpen=false;
 if(chatWrapEl)chatWrapEl.style.display='none';
 if(chatLineEl)chatLineEl.blur();
 if(typeof tryLock==='function')tryLock();
 chatRestartFades();
}

function chatKeydown(e){
 if(!chatOpen){
  if(state!=='play')return false;
  if(e.code==='KeyT'){openChat('');e.preventDefault();return true;}
  if(e.code==='Slash'){openChat('/');e.preventDefault();return true;}
  if(e.code==='Enter'||e.code==='NumpadEnter'){openChat('');e.preventDefault();return true;}
  return false;
 }
 // chat is open — game must see NONE of these keys
 if(e.code==='Escape'){closeChat();e.preventDefault();return true;}
 if(e.code==='Enter'||e.code==='NumpadEnter'){chatSubmit();e.preventDefault();return true;}
 return true;
}

function chatSubmit(){
 chatEls();
 var raw=chatLineEl?chatLineEl.value:'';
 var text=raw.replace(/^\s+|\s+$/g,'');
 closeChat();
 if(!text)return;
 if(text.charAt(0)==='/'){chatRunCommand(text.slice(1));}
 else{addChatMsg('<'+((typeof mpName==='function')?mpName():'you')+'> '+text,'');if(typeof mpChat==='function')mpChat(text);}
}

function chatPruneNow(){
 while(chatMsgs.length>CHAT_MAX){
  var old=chatMsgs.shift();
  if(old&&old.el&&old.el.parentNode)old.el.parentNode.removeChild(old.el);
  if(old){clearTimeout(old.fadeT);clearTimeout(old.remT);}
 }
}

function chatRestartFades(){
 for(var i=0;i<chatMsgs.length;i++)chatScheduleFade(chatMsgs[i]);
}

function chatScheduleFade(entry){
 if(!entry||!entry.el)return;
 clearTimeout(entry.fadeT);clearTimeout(entry.remT);
 entry.el.style.opacity='1';
 entry.fadeT=setTimeout(function(){
  if(chatOpen)return;
  entry.el.style.opacity='0';
 },CHAT_FADE_MS);
 entry.remT=setTimeout(function(){
  if(chatOpen)return;
  if(entry.el&&entry.el.parentNode)entry.el.parentNode.removeChild(entry.el);
  var idx=chatMsgs.indexOf(entry);
  if(idx>=0)chatMsgs.splice(idx,1);
 },CHAT_REMOVE_MS);
}

function addChatMsg(text,cls){
 chatEls();
 if(!chatLogEl)return;
 var div=document.createElement('div');
 div.className='cmsg'+(cls?(' '+cls):'');
 div.textContent=(typeof text==='string')?text:String(text);
 chatLogEl.appendChild(div);
 var entry={el:div,fadeT:null,remT:null};
 chatMsgs.push(entry);
 chatPruneNow();
 if(chatOpen){
  div.style.opacity='1';
 }else{
  chatScheduleFade(entry);
 }
}

// ===== commands =====

function chatHelpLines(){
 return [
  '/help — list all commands',
  '/end — travel to the End and face the dragon (again to return)',
  '/host — host a multiplayer world (get a room code)',
  '/join CODE — join a teammate\'s world',
  '/leave — leave the multiplayer session',
  '/players — list who\'s online',
  '/name YOURNAME — set your multiplayer name',
  '/nooks — toggle the Nooks dialer dock',
  '/time day|noon|night — set time of day',
  '/gamemode s|survival|c|creative — change gamemode',
  '/fly — toggle flight',
  '/tp <x> <y> <z> — teleport',
  '/give <name|id> [count] — give yourself an item/block',
  '/clear — clear your inventory',
  '/kill — end it all (survival)',
  '/pos — show your position',
  '/seed — show world seed'
 ];
}

function chatResolveItemId(nameOrId){
 var n=Number(nameOrId);
 if(!isNaN(n)&&nameOrId!==''&&nameOrId!==null&&nameOrId!==undefined)return Math.floor(n);
 var q=String(nameOrId).toLowerCase();
 if(typeof BLOCKS!=='undefined'&&BLOCKS){
  for(var bid in BLOCKS){
   if(BLOCKS[bid]&&typeof BLOCKS[bid].n==='string'&&BLOCKS[bid].n.toLowerCase()===q)return Number(bid);
  }
 }
 if(typeof ITEMS!=='undefined'&&ITEMS){
  for(var iid in ITEMS){
   if(ITEMS[iid]&&typeof ITEMS[iid].n==='string'&&ITEMS[iid].n.toLowerCase()===q)return Number(iid);
  }
 }
 return null;
}

function chatRunCommand(body){
 var parts=body.replace(/^\s+|\s+$/g,'').split(/\s+/);
 if(parts.length===1&&parts[0]==='')parts=[''];
 var cmd=parts[0].toLowerCase();
 var args=parts.slice(1);
 switch(cmd){
  case 'help':{
   var lines=chatHelpLines();
   for(var i=0;i<lines.length;i++)addChatMsg(lines[i],'sys');
   break;
  }
  case 'nooks':{
   if(typeof nooksVisible!=='function'||typeof openNooks!=='function'||typeof closeNooks!=='function'){
    addChatMsg('Nooks dock unavailable','sys');
    break;
   }
   if(nooksVisible()){closeNooks();addChatMsg('Nooks dock closed','sys');}
   else{openNooks();addChatMsg('Nooks dock opened — /nooks again to close','sys');}
   break;
  }
  case 'time':{
   var w=(args[0]||'').toLowerCase();
   var v=(w==='day')?0.28:(w==='noon')?0.25:(w==='night')?0.78:null;
   if(v===null){addChatMsg('Usage: /time day|noon|night','err');break;}
   if(typeof setTimeOfDay==='function'){setTimeOfDay(v);addChatMsg('Time set to '+w,'sys');}
   else addChatMsg('Time control unavailable','err');
   break;
  }
  case 'gamemode':{
   var g=(args[0]||'').toLowerCase();
   var gm=(g==='s'||g==='survival')?'survival':(g==='c'||g==='creative')?'creative':null;
   if(gm===null){addChatMsg('Usage: /gamemode s|survival|c|creative','err');break;}
   if(typeof setGamemode==='function'){setGamemode(gm);addChatMsg('Gamemode set to '+gm,'sys');}
   else addChatMsg('Gamemode control unavailable','err');
   break;
  }
  case 'fly':{
   P.fly=!P.fly;
   addChatMsg('Flight '+(P.fly?'enabled':'disabled'),'sys');
   break;
  }
  case 'tp':{
   if(args.length<3){addChatMsg('Usage: /tp <x> <y> <z>','err');break;}
   var tx=Number(args[0]),ty=Number(args[1]),tz=Number(args[2]);
   if(isNaN(tx)||isNaN(ty)||isNaN(tz)){addChatMsg('Usage: /tp <x> <y> <z>','err');break;}
   ty=Math.max(1,Math.min(63,ty));
   P.x=tx;P.y=ty;P.z=tz;P.vx=0;P.vy=0;P.vz=0;
   addChatMsg('Teleported to '+tx+' '+ty+' '+tz,'sys');
   break;
  }
  case 'give':{
   if(args.length<1){addChatMsg('Usage: /give <name|id> [count]','err');break;}
   var id=chatResolveItemId(args[0]);
   if(id===null){addChatMsg('Unknown item/block: '+args[0],'err');break;}
   var count=args[1]!==undefined?Math.max(1,Math.floor(Number(args[1])||1)):1;
   if(gamemode==='creative'){
    addChatMsg('Creative has infinite blocks','sys');
   }else if(typeof invAdd==='function'){
    invAdd(id,count);
    addChatMsg('Gave you '+count+'x '+args[0],'sys');
   }else{
    addChatMsg('Inventory unavailable','err');
   }
   break;
  }
  case 'clear':{
   if(typeof invAll==='function'){
    var all=invAll();
    if(all&&typeof invTake==='function'){
     for(var kid in all){
      var have=all[kid]||0;
      if(have>0)invTake(Number(kid),have);
     }
    }
    if(typeof refreshCounts==='function')refreshCounts();
    if(typeof buildHotbar==='function')buildHotbar();
    addChatMsg('Inventory cleared','sys');
   }else{
    addChatMsg('Inventory unavailable','sys');
   }
   break;
  }
  case 'kill':{
   if(gamemode==='creative'){
    addChatMsg('Nothing can kill you in creative','sys');
   }else if(typeof damagePlayer==='function'){
    damagePlayer(999,'Ended it all');
    addChatMsg('Ended it all','sys');
   }else{
    addChatMsg('Kill command unavailable','err');
   }
   break;
  }
  case 'pos':{
   addChatMsg('XYZ '+P.x.toFixed(2)+' '+P.y.toFixed(2)+' '+P.z.toFixed(2),'sys');
   break;
  }
  case 'host':{
   if(typeof mpHost==='function')mpHost();else addChatMsg('Multiplayer unavailable','err');
   break;
  }
  case 'join':{
   if(typeof mpJoin==='function')mpJoin(parts[1]);else addChatMsg('Multiplayer unavailable','err');
   break;
  }
  case 'leave':{
   if(typeof mpLeave==='function')mpLeave();else addChatMsg('Multiplayer unavailable','err');
   break;
  }
  case 'players':{
   if(typeof mpPlayers==='function')mpPlayers();else addChatMsg('Multiplayer unavailable','err');
   break;
  }
  case 'name':{
   if(typeof mpSetName==='function')mpSetName(parts.slice(1).join(' '));
   break;
  }
  case 'end':{
   if(typeof endTeleport==='function')endTeleport();
   else addChatMsg('The End is unavailable','err');
   break;
  }
  case 'seed':{
   addChatMsg('World seed: '+SEED,'sys');
   break;
  }
  default:{
   addChatMsg('Unknown command — /help','err');
  }
 }
}
