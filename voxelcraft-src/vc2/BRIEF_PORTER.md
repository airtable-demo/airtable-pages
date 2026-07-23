# BRIEF — Porter | Dock Builder
You own ONE new file: /agent/workspace/vc2/49_nooks.js (create it).
Read /agent/workspace/vc2/HARNESS.md — especially the V4 ADDENDUM (CSP facts, core hooks, DOM shell ready).
Skim 00_head.html for #nooksPanel structure and 40_player.js for suppressNextUnlockPause/tryLock.

## Mission
The /nooks floating dock: left-side in-game panel + guaranteed-working popup dialer window.

## Behavior
- var nooksDragging=false; (top-level, exact name — core reads it)
- nooksVisible(): panel display is flex.
- openNooks(): show panel (display flex); FIRST open only: set #nooksFrame src=NOOKS_URL; set #nooksNote text:
  'Nooks blocks in-page embedding (their frame-ancestors security header) — if the frame above is blank, that is
  Nooks, not the game. The floating window has the full dialer: mic, calls, everything.';
  suppressNextUnlockPause(); try document.exitPointerLock(); addChatMsg guard sys 'Nooks dock open'.
- closeNooks(): hide panel; tryLock() guard.
- #nooksClose click -> closeNooks(). #nooksPop and #nooksOpenWin click -> openPopup():
  window.open(NOOKS_URL,'nooksDialer','popup=yes,width=430,height='+Math.min(920,(screen.availHeight||900)-70)+',left=8,top=56');
  keep the reference; if already open and not closed -> focus() it instead. addChatMsg sys guard
  'Floating Nooks window opened on the left — log in there and dial while you play'.
- DRAG: mousedown on #nooksHead (not on its buttons) -> nooksDragging=true, record offsets,
  set #nooksFrame.style.pointerEvents='none' during drag; document mousemove repositions panel
  (clamp fully on-screen); mouseup -> nooksDragging=false, restore pointerEvents.
- RESIZE: mousedown on #nooksResize -> same pattern, adjust width/height (min 320x300, max 92vw/92vh).
- Panel must NOT capture WASD: no key listeners at all.

## Constraints
Top-level: declarations only (+ lazy DOM refs). Allowed listeners: click/mousedown on YOUR panel elements +
document mousemove/mouseup for drag (always active-guarded by your own flags). node --check your file AND
python3 /agent/workspace/vc2/build_vc.py --check-only must pass. Only edit your file. Return JSON {files,features,check,notes}.
