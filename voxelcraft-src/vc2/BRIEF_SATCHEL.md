# BRIEF — Satchel | Inventory Clerk
You own ONE new file: /agent/workspace/vc2/47_inventory.js (create it).
Read /agent/workspace/vc2/HARNESS.md (incl. V3 ADDENDUM) fully. Read 50_game.js (buildHotbar/drawSlotIcon/
slotName/setSlotCounts/openInventory already exist and call your functions via typeof guards) and 00_head.html
(#invGrid, #craftList, .icell/.icnt/.crow/.invhint CSS ready).

## Mission
Inventory data model + persistence, hotbar slot assignment, E-screen rendering, crafting.

## Required globals (EXACT names)
- var-backed store: inventory={id:count}, hotbarSlots=[null x9]. Load/save localStorage 'voxelcraft_inv_v1'
  as JSON {inv:{...},hotbar:[...]}, save debounced ~500ms after any change. Corrupt/missing -> empty (START EMPTY: no freebies).
- invAdd(id,n): add; if survival and id is in NO hotbar slot and an empty slot exists, auto-assign to first
  empty slot and call buildHotbar(); else refreshCounts(). Guard buildHotbar with typeof.
- invTake(id,n)->bool (false if insufficient; never negative), invCount(id)->number, invAll()->the object.
- getHotbarSlots()->hotbarSlots
- setHotbarSlot(i,id): assign (id may be null to clear); if the id already sits in another slot, SWAP them; save; buildHotbar().
- getSelectedItemId(): gamemode==='survival' ? hotbarSlots[sel] : HOTBAR[sel]   (sel + HOTBAR + gamemode are core globals)
- refreshCounts(): survival -> setSlotCounts(inventory); creative -> setSlotCounts(null). (setSlotCounts is core.)
- renderInventory(): rebuild #invGrid: one .icell per inventory id with count>0 — canvas icon via core
  drawSlotIcon(g2ctx,id) (handles blocks AND items), .icnt count, title=slotName(id); click -> setHotbarSlot(sel,id)
  + re-render + toast(slotName(id)+' -> slot '+(sel+1)).
  Then rebuild #craftList from the canonical recipe list in the harness: each .crow = result icon canvas,
  .cing text like '3 Planks + 2 Sticks -> Wooden Pickaxe', CRAFT button disabled unless all ingredients
  affordable (invCount); click -> invTake ingredients, invAdd result, re-render both panels, blip(600,400,0.08,0.08).
  Craft works while the E screen is open (state==='inv').
- Also render counts fresh whenever inventory changes while E screen open.

## Notes
- Empty-count items disappear from the grid (and auto-clear from hotbar slots? NO — keep the slot assignment,
  count badge just reads 0; placement is blocked by tryConsume).
- No new document-level event listeners except click handlers on elements YOU create inside #invGrid/#craftList.
- Everything runtime-lazy; top-level = declarations + one load-from-storage call is OK.

## Checks + return
node --check your file AND python3 /agent/workspace/vc2/build_vc.py --check-only. Only edit your file.
Return JSON {files,features,check,notes}.
