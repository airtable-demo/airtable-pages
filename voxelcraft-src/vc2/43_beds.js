// MODULE 43: Beds (OWNER: Slumber)
// Block BED=33, tile 38 (red blanket + cream pillow), useBed(x,y,z) hook

var BED = 33;
BLOCKS[BED] = { n: 'Bed', t: [38, 38, 38], shape: 'slab' };
PCOL[BED] = 0xb03030;

// Paint block-atlas tile 38: red blanket with cream pillow band
(function () {
    var p = tileXY(38);
    var px0 = p[0], py0 = p[1];

    // Base fill: crimson blanket
    ag.fillStyle = '#b03030';
    ag.fillRect(px0, py0, TS, TS);

    // Darker fold lines across blanket (~horizontal ridges, chunky 2-3px)
    var foldColors = ['#8c2222', '#962828', '#7a1c1c'];
    var foldY = [5, 11, 17, 22];
    for (var fi = 0; fi < foldY.length; fi++) {
        ag.fillStyle = foldColors[fi % foldColors.length];
        ag.fillRect(px0, py0 + foldY[fi], TS, 2);
    }

    // Vertical quilt-line detail (subtle, chunky)
    ag.fillStyle = '#9a2828';
    for (var xi = 4; xi < TS; xi += 8) {
        ag.fillRect(px0 + xi, py0, 1, Math.round(TS * 0.7));
    }

    // Cream/white pillow band on top edge (~30% of tile height)
    var pillowH = Math.round(TS * 0.30);
    ag.fillStyle = '#e8e4da';
    ag.fillRect(px0, py0, TS, pillowH);

    // Pillow texture: slight warm shadow at bottom of pillow band
    ag.fillStyle = '#d4cfc4';
    ag.fillRect(px0, py0 + pillowH - 3, TS, 3);

    // Pillow highlight dots (chunky, cream)
    ag.fillStyle = '#f0ede6';
    for (var pi2 = 2; pi2 < TS - 4; pi2 += 7) {
        ag.fillRect(px0 + pi2, py0 + 3, 4, 3);
    }

    // Pillow centre crease
    ag.fillStyle = '#c8c3b8';
    ag.fillRect(px0 + Math.round(TS / 2) - 1, py0, 2, pillowH);

    if (typeof atlas !== 'undefined') atlas.needsUpdate = true;
})();

// --- Bed sleep overlay (single reusable div, created once) ---
var _bedFadeEl = null;
function _getBedFadeEl() {
    if (_bedFadeEl) return _bedFadeEl;
    var d = document.createElement('div');
    d.id = 'bed-sleep-fade';
    d.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:#000;opacity:0;z-index:9;pointer-events:none;' +
        'transition:opacity 0.35s ease;';
    document.body.appendChild(d);
    _bedFadeEl = d;
    return d;
}

function useBed(x, y, z) {
    // Night check: prefer isNight() if available, else fall back to skyK threshold
    var night = (typeof isNight === 'function') ? isNight() : (skyK < 0.28);
    if (!night) {
        toast('You can only sleep at night');
        return;
    }

    // Skip time to morning
    if (typeof setTimeOfDay === 'function') setTimeOfDay(0.28);

    // Set spawn point
    SPAWNX = x + 0.5;
    SPAWNZ = z + 0.5;
    spawnY = y + 1.2;

    // Persist spawn to WMETA (skip for guests)
    if (typeof WMETA !== 'undefined' && WMETA !== null) {
        if (!(typeof mpIsGuest === 'function' && mpIsGuest())) {
            try {
                WMETA.sx = x;
                WMETA.sz = z;
                localStorage.setItem('voxelcraft_meta_v1', JSON.stringify(WMETA));
            } catch (e) {}
        }
    }

    // Feedback
    toast('You slept through the night. Spawn point set.');
    blip(220, 140, 0.4, 0.07);

    // Gentle screen fade: black 0->1->0 over ~1.2s
    var el = _getBedFadeEl();
    el.style.transition = 'opacity 0.35s ease';
    el.style.opacity = '1';
    setTimeout(function () {
        el.style.opacity = '0';
    }, 700);
}
