# BRIEF — Fauna | Mob Wrangler
You own ONE new file: /agent/workspace/vc2/35_mobs.js (create it).
Read /agent/workspace/vc2/HARNESS.md first. Read base_game.js for engine context (materials, scene usage).

## Mission
Living world: pigs wander by day, zombies hunt at night. Box-model mobs, simple physics, hittable.

## Required globals you must define
- function initMobs()            [called once from nothing — self-init at first updateMobs call is fine too]
- function updateMobs(dt)        [called every frame while state==='play']
- function hitMob() -> bool      [player attack: raycast-ish test from camera; apply damage+knockback;
                                  return true if a mob was hit (core then skips block mining)]

## Spec
Mob body: THREE.Group of BoxGeometry meshes (MeshLambertMaterial, flat colors — pig #e89d9d + darker snout,
zombie #5d8f57 body + #3f6b3a head, dark eyes via tiny boxes). Legs (4 for pig, 2 arms + 2 legs zombie)
animated with sin swing while moving. Size approx: pig 0.9w x 0.9h; zombie 0.6w x 1.8h. Shadowless.
Store per-mob: pos, vel, yaw, targetYaw, state timer, hp (pig 6, zombie 12), hurtT (red flash: set
material emissive briefly or scale pulse).

Physics (implement locally with getBlock/isSolid): gravity 26, ground clamp — feet block solid -> sit on top;
1-block auto step-up when moving into a solid with air above it; don't walk off into water deeper than 1
(check ahead block); despawn/kill if y<-10.

Pigs: cap 8 within 60 of player. Spawn on grass (findGroundY) 18-45 blocks from player, daytime bias.
Wander: pick random nearby target every 3-8s, walk 1.6/s toward it, idle pauses. Ambient oink:
blip(340,260,0.08,0.05) rarely (~every 6-14s per pig, hash-random).
Zombies: only spawn when isNight() (cap 6), 20-40 from player on solid ground. Chase player if dist<20
at 2.5/s (else slow wander). Contact (dist<1.3 horizontal, |dy|<2): call damagePlayer(2,'Slain by a zombie')
if typeof damagePlayer==='function', throttled to once per 1.0s per zombie; small player knockback:
P.vx+=dirX*6;P.vy=Math.max(P.vy,4);P.vz+=dirZ*6. Groan blip(120,70,0.25,0.06) occasionally.
At dawn (!isNight()): zombies despawn over ~2s with burst() poof at their position.

hitMob(): find nearest mob within 3.6 of camera whose angular offset from view dir < ~0.35 rad
(dot product of normalized to-mob vector with camera forward > 0.94). If found: hp -= 4 (creative: instant kill? no — same),
knockback away from player (vel += dir*7, vy 4.5), hurt flash, blip(200,120,0.08,0.1); if hp<=0:
burst() at position + remove from scene + free slot. Return true. Else false.
Get camera forward: new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).

Perf: single shared geometries/materials where possible; skip AI update for mobs >70 away (just gravity);
mob meshes frustumCulled default.

## Constraints
- Top-level: function declarations + plain var data only. All THREE object creation lazily on first
  updateMobs/spawn (scene exists at runtime — but keep top-level clean anyway).
- No DOM. No new event listeners. No sleep. Guard every optional external with typeof.
- node --check your file + python3 /agent/workspace/vc2/build_vc.py --check-only must pass.
Return the JSON per harness.
