
// ---------- 54_mp.js: multiplayer co-op — WebRTC fast path + WebSocket-relay fallback ----------
// /host -> room code. /join CODE tries a direct WebRTC link (PeerJS); if the network blocks it
// (corporate NAT/VPN), it transparently falls back to relaying through a public MQTT-over-WSS
// broker — both sides only ever dial OUT over TLS, so it works anywhere HTTPS works.

var MP={active:false,role:null,code:null,peer:null,conns:{},remotes:{},guest:false,
        posT:0,name:null,applying:false,gid:null,mq:null,mqReady:false,rtcReady:false,
        joinPhase:null,expiry:{}};
var MP_ICE={iceServers:[
 {urls:'stun:stun.l.google.com:19302'},
 {urls:'stun:stun1.l.google.com:19302'},
 {urls:'turn:staticauth.openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
 {urls:'turn:staticauth.openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'},
 {urls:'turn:staticauth.openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'},
 {urls:'turn:freeturn.net:3478',username:'free',credential:'free'},
 {urls:'turns:freeturn.tel:5349',username:'free',credential:'free'}]};
var MQ_BROKERS=['wss://broker.emqx.io:8084/mqtt','wss://test.mosquitto.org:8081'];
var MQ_NS='vcraft2/';

function mpIsGuest(){return MP.guest;}
function mpName(){
 if(MP.name)return MP.name;
 try{MP.name=localStorage.getItem('vc_name')||'';}catch(e){}
 if(!MP.name){MP.name='Miner'+Math.floor(Math.random()*90+10);}
 return MP.name;
}
function mpSetName(n){
 MP.name=(n||'').slice(0,14)||mpName();
 try{localStorage.setItem('vc_name',MP.name);}catch(e){}
 if(typeof addChatMsg==='function')addChatMsg('Name set: '+MP.name,'sys');
}
function mpMsg(m,cls){if(typeof addChatMsg==='function')addChatMsg(m,cls||'sys');}
function mpChip(txt){
 var el=document.getElementById('mpchip');if(!el)return;
 if(!txt){el.style.display='none';return;}
 el.style.display='block';el.textContent=txt;
}
function mpChipUpdate(){
 if(!MP.active){mpChip(null);return;}
 var n=0;for(var k in MP.conns)n++;
 if(MP.role==='host')mpChip('⬡ HOSTING '+MP.code+(MP.mqReady?' · direct+relay':' · direct only')+' · '+n+' joined');
 else mpChip('⬡ IN '+MP.code+(MP.transport==='mqtt'?' via relay':''));
}
function mpCodeGen(){
 var A='ABCDEFGHJKMNPQRSTUVWXYZ23456789',s='';
 for(var i=0;i<4;i++)s+=A[Math.floor(Math.random()*A.length)];
 return s;
}
// ---------- avatars ----------
function mpAvatar(name){
 var g=new THREE.Group();
 var skin=new THREE.MeshLambertMaterial({color:0xd8a37a});
 var shirt=new THREE.MeshLambertMaterial({color:0x2e8f83});
 var pants=new THREE.MeshLambertMaterial({color:0x35354a});
 var head=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5),skin);head.position.y=1.55;g.add(head);
 var body=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.72,0.28),shirt);body.position.y=0.95;g.add(body);
 var aL=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.66,0.16),skin);aL.position.set(0.34,0.95,0);g.add(aL);
 var aR=aL.clone();aR.position.x=-0.34;g.add(aR);
 var lL=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.62,0.2),pants);lL.position.set(0.13,0.31,0);g.add(lL);
 var lR=lL.clone();lR.position.x=-0.13;g.add(lR);
 var c=document.createElement('canvas');c.width=256;c.height=64;
 var g2=c.getContext('2d');g2.fillStyle='rgba(8,10,18,0.65)';g2.fillRect(0,0,256,64);
 g2.fillStyle='#ffffff';g2.font='700 34px monospace';g2.textAlign='center';g2.fillText(name.slice(0,14),128,44);
 var tex=new THREE.CanvasTexture(c);
 var tag=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,fog:false}));
 tag.scale.set(1.9,0.48,1);tag.position.y=2.15;g.add(tag);
 g.userData={aL:aL,aR:aR,lL:lL,lR:lR};
 scene.add(g);
 return g;
}
function mpUpsertRemote(id,name,x,y,z,yaw){
 var r=MP.remotes[id];
 if(!r){r={g:mpAvatar(name||'Miner'),name:name,tx:x,ty:y,tz:z,tyaw:yaw||0,lx:x,lz:z,anim:0,seen:0};
  r.g.position.set(x,y,z);MP.remotes[id]=r;
  mpMsg((name||'A miner')+' is here','sys');mpChipUpdate();}
 r.tx=x;r.ty=y;r.tz=z;r.tyaw=yaw||0;r.seen=0;
}
function mpRemoveRemote(id){
 var r=MP.remotes[id];if(!r)return;
 scene.remove(r.g);delete MP.remotes[id];
}
// ---------- transport-agnostic send ----------
function mpSendAll(msg,exceptId){
 for(var k in MP.conns){if(exceptId&&k===exceptId)continue;
  try{MP.conns[k].send(msg);}catch(e){}}
}
// ---------- protocol ----------
function mpHandle(fromId,d){
 if(!d||!d.t)return;
 if(d.t==='hello'){
  if(MP.role!=='host')return;
  var c=MP.conns[fromId];if(c)c.label2=d.name||'Miner';
  try{MP.conns[fromId].send({t:'world',seed:SEED,edits:edits,tod:tod,x:P.x,y:P.y,z:P.z,
   dragonSlain:!!(typeof WMETA!=='undefined'&&WMETA.dragonSlain),ver:(typeof VC_VERSION!=='undefined')?VC_VERSION:'?'});}catch(e){}
  mpMsg((d.name||'A miner')+' joined the world','sys');
  mpSendAll({t:'chat',name:'*',msg:(d.name||'A miner')+' joined'},fromId);
 }
 else if(d.t==='world'){mpAdoptWorld(d);}
 else if(d.t==='pos'){
  if(MP.role!=='host')return;
  MP.expiry[fromId]=0;
  mpUpsertRemote(fromId,(MP.conns[fromId]&&MP.conns[fromId].label2)||d.name,d.x,d.y,d.z,d.yaw);
  mpSendAll({t:'rpos',id:fromId,name:(MP.conns[fromId]&&MP.conns[fromId].label2)||d.name,x:d.x,y:d.y,z:d.z,yaw:d.yaw},fromId);
 }
 else if(d.t==='rpos'){mpUpsertRemote(d.id,d.name,d.x,d.y,d.z,d.yaw);}
 else if(d.t==='block'){
  if(MP.role!=='host')return;
  mpApplyBlock(d.x,d.y,d.z,d.id);
  mpSendAll({t:'rblock',x:d.x,y:d.y,z:d.z,id:d.id},fromId);
 }
 else if(d.t==='rblock'){mpApplyBlock(d.x,d.y,d.z,d.id);}
 else if(d.t==='chat'){
  mpMsg('<'+(d.name||'?')+'> '+d.msg,'');
  if(MP.role==='host')mpSendAll({t:'chat',name:d.name,msg:d.msg},fromId);
 }
 else if(d.t==='bye'){
  if(MP.role==='host'){var nm=(MP.conns[fromId]&&MP.conns[fromId].label2)||'A miner';
   delete MP.conns[fromId];mpRemoveRemote(fromId);mpMsg(nm+' left','sys');mpChipUpdate();}
 }
}
function mpApplyBlock(x,y,z,id){
 MP.applying=true;
 try{
  var cx=Math.floor(x/CH),cz=Math.floor(z/CH);
  if(!chunks.has(ck(cx,cz)))genChunk(cx,cz);
  setBlock(x,y,z,id);
 }catch(e){}
 MP.applying=false;
}
function mpOnBlock(wx,wy,wz,id){
 if(!MP.active||MP.applying)return;
 if(MP.role==='guest'){try{MP.conns.host.send({t:'block',x:wx,y:wy,z:wz,id:id});}catch(e){}}
 else if(MP.role==='host'){mpSendAll({t:'rblock',x:wx,y:wy,z:wz,id:id});}
}
function mpChat(text){
 if(!MP.active)return;
 var m={t:'chat',name:mpName(),msg:text.slice(0,140)};
 if(MP.role==='guest'){try{MP.conns.host.send(m);}catch(e){}}
 else mpSendAll(m);
}
function mpAdoptWorld(d){
 if(MP.role!=='guest'||MP.worldAdopted)return;
 MP.worldAdopted=true;
 MP.guest=true;
 SEED=d.seed;
 chunks.forEach(function(c){
  if(c.meshO){scene.remove(c.meshO);c.meshO.geometry.dispose();}
  if(c.meshT){scene.remove(c.meshT);c.meshT.geometry.dispose();}
 });
 chunks.clear();TORCHES.clear();genQ.length=0;
 edits=d.edits||{};
 if(typeof WMETA!=='undefined'){WMETA.dragonSlain=!!d.dragonSlain;}
 tod=d.tod||0.3;
 var scx=Math.floor(d.x/CH),scz=Math.floor(d.z/CH);
 for(var i=scx-1;i<=scx+1;i++)for(var j=scz-1;j<=scz+1;j++)genChunk(i,j);
 P.x=d.x+1.5;P.y=d.y+0.5;P.z=d.z+1.5;P.vx=P.vy=P.vz=0;
 mpMsg('Joined the world! Blocks sync live. (Your own world is safe — reload to return to it.)','sys');
 if(typeof toast==='function')toast('Welcome to '+MP.code+"'s world");
 mpChipUpdate();
}
// ---------- MQTT relay ----------
function mqConnect(onReady,onFail){
 if(typeof mqtt==='undefined'){onFail&&onFail('no-lib');return null;}
 var bi=0,done=false;
 function tryBroker(){
  if(bi>=MQ_BROKERS.length){if(!done){done=true;onFail&&onFail('unreachable');}return;}
  var url=MQ_BROKERS[bi++];
  var cl;
  try{cl=mqtt.connect(url,{connectTimeout:6000,keepalive:20,clean:true,reconnectPeriod:3000});}
  catch(e){tryBroker();return;}
  var settled=false;
  cl.on('connect',function(){if(settled)return;settled=true;if(!done){done=true;onReady(cl);}else{try{cl.end(true);}catch(e){}}});
  cl.on('error',function(){if(!settled){settled=true;try{cl.end(true);}catch(e){}tryBroker();}});
  setTimeout(function(){if(!settled){settled=true;try{cl.end(true);}catch(e){}tryBroker();}},7000);
 }
 tryBroker();
}
function mqHostStart(){
 mqConnect(function(cl){
  MP.mq=cl;MP.mqReady=true;
  cl.subscribe(MQ_NS+MP.code+'/up');
  cl.on('message',function(topic,payload){
   if(!MP.active||MP.role!=='host')return;
   var d;try{d=JSON.parse(payload.toString());}catch(e){return;}
   if(!d.gid)return;
   var cid='mq_'+d.gid;
   if(!MP.conns[cid]){
    MP.conns[cid]={send:function(m){try{MP.mq.publish(MQ_NS+MP.code+'/down/'+d.gid,JSON.stringify(m));}catch(e){}},label2:d.name};
   }
   mpHandle(cid,d);
  });
  mpChipUpdate();
  mpMsg('Relay ready — teammates on strict networks can join too','sys');
 },function(){mpMsg('Relay unavailable (direct links only)','err');});
}
function mqGuestJoin(code){
 MP.joinPhase='relay';
 mpMsg('Direct link blocked by the network — switching to relay…','sys');
 mqConnect(function(cl){
  MP.mq=cl;MP.mqReady=true;
  MP.gid=Math.random().toString(36).slice(2,10);
  var down=MQ_NS+code+'/down/'+MP.gid;
  cl.subscribe(down);
  cl.on('message',function(topic,payload){
   var d;try{d=JSON.parse(payload.toString());}catch(e){return;}
   mpHandle('host',d);
  });
  MP.active=true;MP.role='guest';MP.code=code;MP.transport='mqtt';
  MP.conns={host:{send:function(m){var mm={};for(var k in m)mm[k]=m[k];mm.gid=MP.gid;mm.name=mm.name||mpName();
   try{cl.publish(MQ_NS+code+'/up',JSON.stringify(mm));}catch(e){}}}};
  MP.conns.host.send({t:'hello',name:mpName()});
  mpChipUpdate();
  // if the host doesn't answer over relay either, the room is truly gone
  setTimeout(function(){if(!MP.worldAdopted&&MP.transport==='mqtt'){
   mpMsg('No answer from the host over relay — is their game open on the latest version? (Both players must hard-refresh)','err');
  }},9000);
 },function(){
  mpMsg('Could not reach the relay either — this network blocks WebSockets. Try a hotspot.','err');
 });
}
// ---------- session ----------
function mpHost(){
 if(typeof Peer==='undefined'){mpMsg('Multiplayer lib failed to load','err');return;}
 if(MP.active){mpMsg(MP.role==='host'?('Already hosting — code '+MP.code):'Already in a world — /leave first','err');return;}
 var code=mpCodeGen();
 var peer=new Peer('vcraft-'+code,{config:MP_ICE});
 MP.peer=peer;
 peer.on('open',function(){
  MP.active=true;MP.role='host';MP.code=code;MP.rtcReady=true;
  mpMsg('Hosting! Room code: '+code,'sys');
  mpMsg('Teammate: open this same page and type /join '+code,'sys');
  if(typeof toast==='function')toast('Room code: '+code);
  mpChipUpdate();
  mqHostStart();
 });
 peer.on('disconnected',function(){try{peer.reconnect();}catch(e){}});
 peer.on('connection',function(conn){
  conn.on('open',function(){MP.conns[conn.peer]=conn;mpChipUpdate();});
  conn.on('data',function(d){mpHandle(conn.peer,d);});
  conn.on('close',function(){
   var nm=(conn.label2||'A miner');
   delete MP.conns[conn.peer];mpRemoveRemote(conn.peer);
   mpMsg(nm+' left','sys');mpChipUpdate();
  });
 });
 peer.on('error',function(e){
  if(e&&e.type==='unavailable-id'){peer.destroy();MP.peer=null;MP.active=false;mpHost();return;}
  if(e&&e.type==='network'){return;} // reconnect handles it
  mpMsg('MP error: '+(e&&e.type||'unknown'),'err');
 });
}
function mpJoin(code){
 if(MP.active){mpMsg('Already connected — /leave first','err');return;}
 code=(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(code.length!==4){mpMsg('Usage: /join CODE (4 letters)','err');return;}
 MP.worldAdopted=false;
 if(typeof Peer==='undefined'){mqGuestJoin(code);return;}
 mpMsg('Connecting to '+code+'…','sys');
 MP.joinPhase='rtc';
 var peer=new Peer({config:MP_ICE});
 MP.peer=peer;
 var fellBack=false;
 function fallBack(){
  if(fellBack||MP.worldAdopted)return;fellBack=true;
  try{peer.destroy();}catch(e){}
  MP.peer=null;MP.active=false;MP.role=null;MP.conns={};
  mqGuestJoin(code);
 }
 peer.on('open',function(){
  var conn=peer.connect('vcraft-'+code,{reliable:true});
  var opened=false;
  conn.on('open',function(){
   opened=true;
   MP.active=true;MP.role='guest';MP.code=code;MP.transport='rtc';MP.conns={host:conn};
   conn.send({t:'hello',name:mpName(),ver:(typeof VC_VERSION!=='undefined')?VC_VERSION:'?'});
   mpChipUpdate();
  });
  conn.on('data',function(d){mpHandle('host',d);});
  conn.on('close',function(){if(MP.transport==='rtc'){mpMsg('Disconnected from host','err');mpLeave(true);}});
  setTimeout(function(){if(!opened)fallBack();},6000); // direct link blocked -> relay
 });
 peer.on('error',function(e){
  if(e&&e.type==='peer-unavailable'){mpMsg('No direct room '+code+' on the broker — trying relay…','sys');fallBack();}
  else if(e&&(e.type==='network'||e.type==='server-error')){fallBack();}
 });
 setTimeout(function(){if(!MP.worldAdopted&&!fellBack&&!MP.active)fallBack();},8000);
}
function mpLeave(silent){
 if(!MP.active&&!MP.peer&&!MP.mq){if(!silent)mpMsg('Not in a multiplayer session','err');return;}
 if(MP.role==='guest'&&MP.conns.host){try{MP.conns.host.send({t:'bye'});}catch(e){}}
 try{if(MP.peer)MP.peer.destroy();}catch(e){}
 try{if(MP.mq)MP.mq.end(true);}catch(e){}
 for(var k in MP.remotes)mpRemoveRemote(k);
 MP.active=false;MP.role=null;MP.peer=null;MP.mq=null;MP.mqReady=false;MP.conns={};MP.expiry={};
 mpChip(null);
 if(!silent)mpMsg(MP.guest?'Left the world. Reload the page to return to your own world.':'Multiplayer session closed','sys');
}
function mpPlayers(){
 if(!MP.active){mpMsg('Not in a session. /host or /join CODE','sys');return;}
 var n=[mpName()+(MP.role==='host'?' (host)':'')];
 for(var k in MP.remotes)n.push(MP.remotes[k].name||'Miner');
 if(MP.role==='host')for(var c in MP.conns){var nm=MP.conns[c].label2;if(nm&&n.indexOf(nm)<0)n.push(nm);}
 mpMsg('Players ('+n.length+'): '+n.join(', '),'sys');
}
// ---------- frame ----------
function updateMP(dt){
 if(!MP.active)return;
 MP.posT-=dt;
 if(MP.posT<=0){
  MP.posT=0.12;
  var m={t:'pos',name:mpName(),x:Math.round(P.x*100)/100,y:Math.round(P.y*100)/100,z:Math.round(P.z*100)/100,yaw:Math.round(yaw*100)/100};
  if(MP.role==='guest'){try{MP.conns.host&&MP.conns.host.send(m);}catch(e){}}
  else{m.t='rpos';m.id='host';mpSendAll(m);}
 }
 if(MP.role==='host'){
  for(var cid in MP.conns){
   if(cid.indexOf('mq_')!==0)continue;
   MP.expiry[cid]=(MP.expiry[cid]||0)+dt;
   if(MP.expiry[cid]>25){
    var nm=(MP.conns[cid].label2||'A miner');
    delete MP.conns[cid];delete MP.expiry[cid];mpRemoveRemote(cid);
    mpMsg(nm+' timed out','sys');mpChipUpdate();
   }
  }
 }
 for(var k in MP.remotes){
  var r=MP.remotes[k];
  r.seen+=dt;
  if(r.seen>20){mpRemoveRemote(k);continue;}
  var g=r.g,lp=g.position;
  var kk=Math.min(1,10*dt);
  lp.x+=(r.tx-lp.x)*kk;lp.y+=(r.ty-lp.y)*kk;lp.z+=(r.tz-lp.z)*kk;
  var dy=r.tyaw-g.rotation.y;
  while(dy>Math.PI)dy-=Math.PI*2;while(dy<-Math.PI)dy+=Math.PI*2;
  g.rotation.y+=dy*kk;
  var hsp=Math.sqrt((lp.x-r.lx)*(lp.x-r.lx)+(lp.z-r.lz)*(lp.z-r.lz))/Math.max(dt,0.001);
  r.lx=lp.x;r.lz=lp.z;
  if(hsp>0.5){r.anim+=dt*hsp*1.6;
   var sw=Math.sin(r.anim*2)*0.5;
   g.userData.lL.rotation.x=sw;g.userData.lR.rotation.x=-sw;
   g.userData.aL.rotation.x=-sw*0.7;g.userData.aR.rotation.x=sw*0.7;}
  else{g.userData.lL.rotation.x*=0.8;g.userData.lR.rotation.x*=0.8;g.userData.aL.rotation.x*=0.8;g.userData.aR.rotation.x*=0.8;}
 }
}
