#!/usr/bin/env python3
"""Assemble voxelcraft.html from vc2/ modules. Usage: build_vc.py [--check-only]"""
import subprocess, sys, os
D = os.path.dirname(os.path.abspath(__file__))
W = os.path.dirname(D)
MODULES = ["10_noise.js","12_blocks.js","14_items.js","20_engine.js","30_world.js","32_terrain.js",
           "35_mobs.js","40_player.js","45_survival.js","47_inventory.js","47b_craftgrid.js","48_chat.js","49_nooks.js","42_drops.js","43_beds.js","44_armor.js","46_chests.js","52_end.js","54_mp.js","50_game.js"]
js = '(function(){\n"use strict";\n'
for m in MODULES:
    p = os.path.join(D, m)
    if not os.path.exists(p):
        print("SKIP (missing):", m); continue
    js += "\n// ---------- " + m + " ----------\n" + open(p).read()
js += "\n})();\n"
open("/tmp/vc_check.js","w").write(js)
r = subprocess.run(["node","--check","/tmp/vc_check.js"], capture_output=True, text=True)
if r.returncode != 0:
    print("SYNTAX FAIL:\n", r.stderr[:3000]); sys.exit(1)
print("syntax OK (%d chars of game js)" % len(js))
if "--check-only" in sys.argv: sys.exit(0)
head = open(os.path.join(D,"00_head.html")).read()
tail = open(os.path.join(D,"99_tail.html")).read()
three = open(os.path.join(W,"three.min.js")).read()
peer = ""
for libf in ["peerjs.min.js", "mqtt.min.js"]:
    pp = os.path.join(W, libf)
    if os.path.exists(pp):
        peer += "<script>\n" + open(pp).read() + "\n</script>\n"
html = head + "<script>\n" + three + "\n</script>\n" + peer + "<script>\n" + js + "</script>\n" + tail
out = os.path.join(W,"voxelcraft.html")
open(out,"w").write(html)
print("built", out, len(html), "bytes")
