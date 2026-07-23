# BRIEF — Herald | Chat Console
You own ONE new file: /agent/workspace/vc2/48_chat.js (create it).
Read /agent/workspace/vc2/HARNESS.md — especially the V4 ADDENDUM (core hooks + DOM are ready for you).
Skim 40_player.js (chatKeydown call site, clearKeys, suppressNextUnlockPause) and 00_head.html (#chatlog/#chatwrap/#chatline).

## Mission
Minecraft-style chat + command console.

## Behavior
- chatKeydown(e): if chat CLOSED and state==='play': KeyT -> openChat(''), Slash -> openChat('/'), Enter -> openChat('');
  all three return true (consumed) and preventDefault. If chat OPEN: Escape -> closeChat(); Enter -> submit; return true
  for EVERY key while open (game must see none). Otherwise return false.
- openChat(prefill): only when state==='play'; clearKeys(); mining=false is core's var — set it via plain assignment
  (it is a shared var, assignable); show #chatwrap; input.value=prefill; focus + cursor at end;
  suppressNextUnlockPause(); try document.exitPointerLock().
- closeChat(): hide, blur, tryLock() (typeof-guard).
- Submit: trim; empty -> just close. Starts with '/' -> run command. Else addChatMsg('<you> '+text). Close after submit
  (MC behavior), EXCEPT keep open after '/help' so the list is readable? No — always close; /help output persists in log.
- addChatMsg(text, cls): append div.cmsg (+cls) to #chatlog via textContent (NEVER innerHTML for user text);
  keep max 10 visible; each message fades (opacity 0) after 7s and is removed at 8s — but while chat is open,
  keep all current messages fully visible (reset opacity on open).

## Commands (exact)
/help — list all commands (multiple sys messages)
/nooks — toggle: if nooksVisible() closeNooks() else openNooks() (typeof-guard; if absent say 'Nooks dock unavailable');
  reply sys 'Nooks dock opened — /nooks again to close' or 'Nooks dock closed'
/time day|noon|night — setTimeOfDay(0.28|0.25|0.78) guard; sys reply
/gamemode s|survival|c|creative — setGamemode guard; sys reply
/fly — P.fly=!P.fly; sys reply
/tp <x> <y> <z> — numbers, clamp y 1..63; set P.x/y/z, zero velocities; sys reply
/give <name|id> [count=1] — resolve id: numeric, or case-insensitive match against BLOCKS[*].n and (typeof ITEMS!=='undefined') ITEMS[*].n;
  survival: invAdd(id,count) guard + sys reply; creative: sys 'Creative has infinite blocks'
/clear — if invAll exists: set every count 0 via invTake loops or direct object zeroing + refreshCounts + buildHotbar (guards); sys reply
/kill — damagePlayer(999,'Ended it all') guard; in creative sys 'Nothing can kill you in creative'
/pos — sys 'XYZ x y z'
/seed — sys 'World seed: 1337'
Unknown -> err 'Unknown command — /help'.

## Constraints
Top-level: declarations + lazy DOM refs only. No new document-level listeners EXCEPT you may attach input's own
keydown ONLY if needed (prefer everything through chatKeydown). node --check your file AND
python3 /agent/workspace/vc2/build_vc.py --check-only must pass. Only edit your file. Return JSON {files,features,check,notes}.
