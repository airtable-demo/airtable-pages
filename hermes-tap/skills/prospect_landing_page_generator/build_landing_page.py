#!/usr/bin/env python3
"""
build_landing_page.py — Phase 3 HTML generator for prospect_landing_page_generator.

Reads a JSON input file with all per-prospect/account/content data, fetches required
media (Wistia mp4 + thumbnails, account favicon, optional profile photos), base64-inlines
everything, computes the theme palette from theme + brand_color, substitutes into the
canonical template, and writes the final HTML to the output path.

This replaces inline LLM HTML generation in Phase 3 — Opus only needs to produce the
content fields (value-card titles+bodies, hero subhead, story modal "why it matters"
paragraphs, optional synthesized POV). Everything else is data + template.

Usage:
    python3 build_landing_page.py input.json [output.html]

Default output: /agent/workspace/landing_page.html
"""
import sys
import os
import json
import base64
import re
import urllib.request
import urllib.error
import urllib.parse
from io import BytesIO

# Pillow for thumbnail resizing — installed if missing
try:
    from PIL import Image
except ImportError:
    import subprocess
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--quiet', 'Pillow'], check=True)
    from PIL import Image


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_PATH = os.path.join(SCRIPT_DIR, 'canonical_template.html')


def http_get(url, timeout=20):
    """Fetch a URL, return (status_code, headers, body_bytes). Follows redirects."""
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 landing-page-builder/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read() if hasattr(e, 'read') else b''
    except Exception as e:
        return 0, {}, str(e).encode()


def fetch_image_as_data_uri(url, max_size=(720, 405), jpeg_quality=82):
    """Fetch image, resize if needed, return data URI string."""
    status, headers, body = http_get(url)
    if status != 200 or not body:
        return None
    # Detect format
    ct = headers.get('Content-Type', '').split(';')[0].strip().lower()
    try:
        img = Image.open(BytesIO(body))
        # Resize if larger than max
        if img.size[0] > max_size[0] or img.size[1] > max_size[1]:
            img.thumbnail(max_size, Image.LANCZOS)
        buf = BytesIO()
        if img.mode in ('RGBA', 'LA', 'P'):
            # Keep PNG for transparency
            img.save(buf, 'PNG', optimize=True)
            fmt = 'image/png'
        else:
            img.save(buf, 'JPEG', quality=jpeg_quality, optimize=True)
            fmt = 'image/jpeg'
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        return f'data:{fmt};base64,{b64}'
    except Exception:
        # Fall back to raw bytes if PIL can't open
        b64 = base64.b64encode(body).decode('ascii')
        return f'data:{ct or "image/jpeg"};base64,{b64}'


def fetch_account_favicon(domain, size=128):
    """Try Google favicons. Returns data URI or None."""
    if not domain:
        return None
    url = f'https://www.google.com/s2/favicons?domain={domain}&sz={size}'
    return fetch_image_as_data_uri(url, max_size=(size, size))


def fetch_wistia_assets(media_id):
    """Fetch a Wistia media bundle. Returns dict with 540p mp4 url, thumbnail data URI, title.

    Falls back to next-best resolution if 540p is missing.
    """
    url = f'https://fast.wistia.com/embed/medias/{media_id}.json'
    status, headers, body = http_get(url)
    if status != 200:
        return None
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return None
    media = data.get('media', {})
    assets = media.get('assets', [])
    mp4_url = None
    thumbnail_url = None
    # Prefer 540p mp4
    target_heights_priority = [540, 720, 360, 1080, 224]
    for h in target_heights_priority:
        for a in assets:
            if a.get('container') == 'mp4' and a.get('height') == h and a.get('public'):
                mp4_url = a.get('url')
                break
        if mp4_url:
            break
    # Get thumbnail
    for a in assets:
        if a.get('type') == 'still_image' and a.get('public'):
            thumbnail_url = a.get('url')
            break
    if not thumbnail_url:
        # Fall back to oembed
        oembed = http_get(f'https://fast.wistia.com/oembed?url=https%3A%2F%2Fairtable.wistia.com%2Fmedias%2F{media_id}')
        if oembed[0] == 200:
            try:
                oembed_data = json.loads(oembed[2])
                thumbnail_url = oembed_data.get('thumbnail_url')
            except json.JSONDecodeError:
                pass
    thumb_uri = fetch_image_as_data_uri(thumbnail_url, max_size=(720, 405)) if thumbnail_url else None
    return {
        'mp4_url': mp4_url,
        'thumbnail_data_uri': thumb_uri,
        'title': media.get('name', ''),
    }


def hex_to_rgb(hex_color):
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgba(hex_color, alpha):
    r, g, b = hex_to_rgb(hex_color)
    return f'rgba({r},{g},{b},{alpha})'


def relative_luminance(r, g, b):
    """WCAG 2.1 relative luminance from 0-255 RGB values."""
    def linearize(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)


def contrast_ratio(lum1, lum2):
    """WCAG contrast ratio between two luminances."""
    lighter = max(lum1, lum2)
    darker = min(lum1, lum2)
    return (lighter + 0.05) / (darker + 0.05)


def ensure_btn_contrast(accent_hex, btn_text_hex, min_ratio=4.5):
    """If the accent color doesn't contrast enough with button text, return a better text color."""
    ar, ag, ab = hex_to_rgb(accent_hex)
    tr, tg, tb = hex_to_rgb(btn_text_hex)
    accent_lum = relative_luminance(ar, ag, ab)
    text_lum = relative_luminance(tr, tg, tb)
    if contrast_ratio(accent_lum, text_lum) >= min_ratio:
        return btn_text_hex
    # Try white and black, pick whichever has better contrast
    white_ratio = contrast_ratio(accent_lum, relative_luminance(255, 255, 255))
    black_ratio = contrast_ratio(accent_lum, relative_luminance(0, 0, 0))
    return '#ffffff' if white_ratio >= black_ratio else '#1F1F33'


def is_dark_accent(hex_color):
    """Returns True if the accent color is too dark for dark-theme UI elements."""
    r, g, b = hex_to_rgb(hex_color)
    return relative_luminance(r, g, b) < 0.15


def compute_palette(theme, brand_color):
    """Compute all :root CSS variable values for the given theme + brand color.

    Includes contrast enforcement: if the brand color is dark (luminance < 0.15)
    on a dark theme, text opacities are boosted and card/modal backgrounds are
    lightened so CTAs, story text, and modal content remain readable.
    """
    r, g, b = hex_to_rgb(brand_color)
    if theme == 'light':
        bg_text = '#1F1F33'
        return {
            'bg': '#FAFAFC',
            'bg_card': '#FFFFFF',
            'bg_cta_alt': rgba(brand_color, 0.035),
            'border': 'rgba(31,31,51,0.10)',
            'nav_border': 'rgba(31,31,51,0.08)',
            'section_bdr': 'rgba(31,31,51,0.08)',
            'text_1': bg_text,
            'text_2': 'rgba(31,31,51,0.65)',
            'text_3': 'rgba(31,31,51,0.55)',
            'accent': brand_color,
            'accent_hover': rgba(brand_color, 0.85),
            'accent_glow': rgba(brand_color, 0.18),
            'accent_muted': rgba(brand_color, 0.06),
            'accent_ring': rgba(brand_color, 0.30),
            'card_shadow': '0 1px 2px rgba(31,31,51,0.06)',
            'card_shadow_h': f'0 0 0 1px {rgba(brand_color, 0.30)},0 12px 24px {rgba(brand_color, 0.10)}',
            'photo_border': 'rgba(31,31,51,0.15)',
            'h1_grad': f'linear-gradient(148deg,#1F1F33 5%,{brand_color} 55%,{rgba(brand_color, 0.85)} 100%)',
            'hero_glow': f'radial-gradient(ellipse 80% 55% at 50% 0%,{rgba(brand_color, 0.16)} 0%,transparent 65%)',
            'noise_opacity': '0.015',
            'noise_blend': 'multiply',
            'chip_bdr': 'rgba(31,31,51,0.15)',
            'chip_text': 'rgba(31,31,51,0.65)',
            'page_bg_image': 'linear-gradient(180deg,#FFFFFF 0%,#F4F5FA 100%)',
            'story_tag': brand_color,
            'proof_bg': rgba(brand_color, 0.06),
            'proof_bdr': rgba(brand_color, 0.20),
            'modal_bg': 'rgba(31,31,51,0.60)',
            'modal_panel_bg': '#FFFFFF',
            'modal_shadow': 'rgba(31,31,51,0.30)',
            'btn_text': '#ffffff',
            'nav_bg': 'rgba(250,250,252,0.85)',
            'chip_bg': 'rgba(255,255,255,0.70)',
            'card_bg': '#FFFFFF',
        }
    else:  # dark
        bg = f'rgb({max(0, r // 10)},{max(0, g // 10)},{max(0, b // 10)})' if (r + g + b) > 30 else 'rgb(13,2,12)'
        dark_accent = is_dark_accent(brand_color)
        # When accent is dark (PlayStation blue, navy, dark green, etc.), boost
        # text opacities and card/modal backgrounds so content stays readable.
        text_2_opacity = 0.70 if dark_accent else 0.50
        text_3_opacity = 0.65 if dark_accent else 0.48
        card_bg_opacity = 0.12 if dark_accent else 0.06
        modal_panel_opacity = 0.14 if dark_accent else 0.06
        border_opacity = 0.12 if dark_accent else 0.07
        accent_ring_opacity = 0.40 if dark_accent else 0.28
        story_tag_opacity = 1.0 if dark_accent else 0.9
        # For very dark accents, lighten the accent used in the h1 gradient
        # so the headline doesn't disappear into the background
        h1_accent = brand_color if not dark_accent else rgba(brand_color, 0.95)
        return {
            'bg': bg,
            'bg_card': rgba(brand_color, card_bg_opacity),
            'bg_cta_alt': rgba(brand_color, 0.04),
            'border': f'rgba(255,255,255,{border_opacity})',
            'nav_border': 'rgba(255,255,255,0.05)',
            'section_bdr': 'rgba(255,255,255,0.055)',
            'text_1': '#f0f0f8',
            'text_2': f'rgba(240,240,248,{text_2_opacity})',
            'text_3': f'rgba(240,240,248,{text_3_opacity})',
            'accent': brand_color,
            'accent_hover': rgba(brand_color, 0.82),
            'accent_glow': rgba(brand_color, 0.42),
            'accent_muted': rgba(brand_color, 0.10),
            'accent_ring': rgba(brand_color, accent_ring_opacity),
            'card_shadow': 'none',
            'card_shadow_h': f'0 0 0 1px {rgba(brand_color, 0.38)},0 0 20px {rgba(brand_color, 0.12)}',
            'photo_border': 'rgba(255,255,255,0.25)',
            'h1_grad': f'linear-gradient(148deg,#ffffff 15%,{h1_accent} 60%,{rgba(brand_color, 0.85)} 100%)',
            'hero_glow': f'radial-gradient(ellipse 80% 55% at 50% 0%,{rgba(brand_color, 0.22 if dark_accent else 0.18)} 0%,transparent 65%)',
            'noise_opacity': '0.02',
            'noise_blend': 'overlay',
            'chip_bdr': 'rgba(255,255,255,0.11)',
            'chip_text': 'rgba(240,240,248,0.62)',
            'page_bg_image': f'linear-gradient(135deg,{rgba(brand_color, 0.07)} 0%,{rgba(brand_color, 0.04)} 100%)',
            'story_tag': rgba(brand_color, story_tag_opacity),
            'proof_bg': rgba(brand_color, 0.08),
            'proof_bdr': rgba(brand_color, 0.22),
            'modal_bg': 'rgba(8,8,14,0.96)',
            'modal_panel_bg': rgba(brand_color, modal_panel_opacity),
            'modal_shadow': 'rgba(0,0,0,0.5)',
            'btn_text': ensure_btn_contrast(brand_color, '#ffffff'),
            'nav_bg': 'transparent',
            'chip_bg': 'transparent',
            'card_bg': rgba(brand_color, card_bg_opacity),
        }


# Airtable wordmark SVGs (light = dark fill, dark = light fill)
AIRTABLE_LOGO_DARK = '''<svg class="airtable-logo" viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg" aria-label="Airtable"><path d="M21.16 15.916l-12.878 5.33c-.716.296-.7 1.314.012 1.6l12.932 5.128a4.8 4.8 0 003.538 0l12.932-5.128c.72-.286.728-1.303.012-1.6l-12.878-5.33a4.8 4.8 0 00-3.67 0" fill="#fcb400"/><path d="M24.144 30.773v12.8c0 .6.614 1.027 1.18.802l14.4-5.593a.86.86 0 00.545-.802v-12.8c0-.6-.614-1.027-1.18-.802l-14.4 5.593a.86.86 0 00-.545.802" fill="#18bfff"/><path d="M20.78 31.434l-4.7 2.275-9.028 4.326c-.572.276-1.303-.14-1.303-.777V25.234c0-.23.118-.43.276-.578a.98.98 0 01.218-.164.92.92 0 01.785-.061l13.7 5.424c.696.276.75 1.25.072 1.58" fill="#f82b60"/><path d="M20.78 31.434L16.502 33.5l-10.5-8.844a.98.98 0 01.218-.164.92.92 0 01.785-.061l13.7 5.424c.696.276.75 1.25.072 1.58" fill="#ba1e45"/><path d="M54.388 31.064l-1.74-4.693c-.07-.192-.343-.192-.414 0l-1.74 4.693a.22.22 0 00.207.297h3.48a.22.22 0 00.207-.297m.804 2.637H49.7a.22.22 0 00-.207.144l-1.083 2.92a.22.22 0 01-.207.144h-2.385a.22.22 0 01-.205-.303l5.5-13.68a.22.22 0 01.205-.138h2.284a.22.22 0 01.205.138l5.5 13.68a.22.22 0 01-.205.303H56.7a.22.22 0 01-.207-.144l-1.083-2.92a.22.22 0 00-.207-.144m5.204-6.112h2.04a.22.22 0 01.221.221v8.88a.22.22 0 01-.221.221h-2.04a.22.22 0 01-.221-.221v-8.9a.22.22 0 01.221-.221m9.7 2.16a.22.22 0 01-.221.221h-.062c-1 0-1.75.242-2.22.726s-.706 1.284-.706 2.4v3.592a.22.22 0 01-.221.221h-2.02a.22.22 0 01-.221-.221V27.8a.22.22 0 01.221-.221h2a.22.22 0 01.221.221v1.756h.04c.242-.726.625-1.284 1.15-1.674s1.17-.585 1.936-.585h.1zm5.578-.082a.22.22 0 00-.221.221v3.693c0 .377.074.645.222.807s.403.242.766.242h.203a.22.22 0 01.221.221V36.7a.22.22 0 01-.221.221h-.87c-.9 0-1.594-.232-2.078-.696s-.726-1.153-.726-2.068v-4.278a.22.22 0 00-.221-.221h-1.273a.22.22 0 01-.221-.221V27.8a.22.22 0 01.221-.221h1.273a.22.22 0 00.221-.221v-3.3a.22.22 0 01.221-.221h2.04a.22.22 0 01.221.221v3.3a.22.22 0 00.221.221h1.475a.22.22 0 01.221.221v1.637a.22.22 0 01-.221.221zm9.34 4.478c.464-.484.696-1.116.696-1.896s-.232-1.412-.696-1.896-1.073-.726-1.826-.726-1.36.242-1.826.726-.696 1.116-.696 1.896.232 1.412.696 1.896 1.072.726 1.826.726 1.362-.242 1.826-.726m-4.7 2.48a4.14 4.14 0 01-1.624-1.705c-.397-.746-.595-1.637-.595-2.673s.198-1.926.595-2.673.938-1.314 1.624-1.705a4.49 4.49 0 012.259-.585c.726 0 1.348.14 1.866.424s.93.68 1.24 1.2h.04V27.8a.22.22 0 01.221-.221h2.02a.22.22 0 01.221.221v8.88a.22.22 0 01-.221.221h-2.02a.22.22 0 01-.221-.221v-1.1h-.04c-.3.5-.723.908-1.24 1.2s-1.14.424-1.866.424c-.82 0-1.573-.195-2.26-.585m16.268-2.48c.464-.484.696-1.116.696-1.896s-.232-1.412-.696-1.896-1.073-.726-1.826-.726-1.362.242-1.826.726-.696 1.116-.696 1.896.232 1.412.696 1.896 1.072.726 1.826.726 1.362-.242 1.826-.726m-3.066 2.643a3.24 3.24 0 01-1.241-1.19h-.04v1.1a.22.22 0 01-.221.221h-2.04a.22.22 0 01-.221-.221V23a.22.22 0 01.221-.221h2.04a.22.22 0 01.221.221v5.9h.04a3.24 3.24 0 011.241-1.19c.518-.283 1.14-.424 1.866-.424a4.49 4.49 0 012.259.585c.686.4 1.227.958 1.624 1.705s.595 1.638.595 2.673-.2 1.927-.595 2.673-.938 1.315-1.624 1.705-1.44.585-2.26.585c-.726 0-1.348-.14-1.866-.424m9.78.12h-2.04a.22.22 0 01-.221-.221V23a.22.22 0 01.221-.221h2.04a.22.22 0 01.221.221V36.7a.22.22 0 01-.221.221m4.812-7.16c-.338.264-.567.645-.685 1.143-.032.137.075.27.216.27h3.882c.135 0 .24-.12.22-.254-.078-.47-.28-.847-.606-1.128-.383-.33-.884-.494-1.503-.494s-1.126.155-1.523.464m4.973-1.16c.793.868 1.2 2.095 1.2 3.68v.264a.22.22 0 01-.221.221h-6.486c-.137 0-.242.125-.218.26.104.6.364 1.058.782 1.405.477.397 1.08.595 1.805.595.938 0 1.805-.366 2.603-1.098a.22.22 0 01.328.038l.992 1.424a.22.22 0 01-.034.292 7.29 7.29 0 01-1.61 1.07c-.645.316-1.405.474-2.28.474-1 0-1.9-.205-2.643-.615a4.35 4.35 0 01-1.755-1.735c-.417-.746-.625-1.6-.625-2.592s.202-1.85.605-2.602.968-1.338 1.695-1.755 1.573-.625 2.542-.625c1.425 0 2.535.434 3.328 1.3m-50.15-4.28a1.51 1.51 0 01-1.507 1.507 1.51 1.51 0 01-1.507-1.507 1.51 1.51 0 011.507-1.507 1.51 1.51 0 011.507 1.507" fill="rgba(240,240,248,0.88)"/></svg>'''

AIRTABLE_LOGO_LIGHT = AIRTABLE_LOGO_DARK.replace('fill="rgba(240,240,248,0.88)"', 'fill="#1F1F33"')


def render_hero_photos(prospect_photo_uri, ae_photo_uri, prospect_first_name, ae_name):
    """Return the <div class='hero-photos'> block, or empty string if no photos."""
    if not prospect_photo_uri and not ae_photo_uri:
        return ''
    inner = []
    if prospect_photo_uri:
        inner.append(f'<img class="hero-photo" src="{prospect_photo_uri}" alt="{prospect_first_name}" '
                     f'loading="eager" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">')
    if prospect_photo_uri and ae_photo_uri:
        inner.append('<span class="hero-photo-sep">×</span>')
    if ae_photo_uri:
        inner.append(f'<img class="hero-photo" src="{ae_photo_uri}" alt="{ae_name}" '
                     f'loading="eager" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">')
    return '<div class="hero-photos">\n      ' + '\n      '.join(inner) + '\n    </div>'


# SVG icons available for value cards
ICONS = {
    'grid': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    'connect': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6 L15.5 6"/><path d="M6 8.5 L6 15.5"/><path d="M8.5 18 L15.5 18"/><path d="M18 8.5 L18 15.5"/></svg>',
    'globe': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="9"/><path d="M12 3 L12 21"/><path d="M3 12 L21 12"/></svg>',
    'spreadsheet': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9 L21 9"/><path d="M9 4 L9 20"/><path d="M14 13 L17 13"/><path d="M14 16 L19 16"/></svg>',
    'star': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M12 2 L14 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L10 8 Z"/></svg>',
    'shield': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    'chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="4" y1="20" x2="20" y2="20"/><rect x="5" y="12" width="3" height="8" rx="1"/><rect x="10.5" y="7" width="3" height="13" rx="1"/><rect x="16" y="4" width="3" height="16" rx="1"/></svg>',
}


def render_value_cards(cards):
    """Render the 4 value cards as HTML."""
    out = []
    for c in cards:
        icon_svg = ICONS.get(c.get('icon', 'grid'), ICONS['grid'])
        out.append(f'''        <div class="card fade">
          <div class="card-icon">{icon_svg}</div>
          <div class="card-title">{c["title"]}</div>
          <div class="card-body">{c["body"]}</div>
        </div>''')
    return '\n'.join(out)


def render_diagram(label, nodes, accent_color):
    """Render the SVG workflow diagram with the given nodes (max 6)."""
    if not nodes:
        return ''
    # Layout: 5 boxes, each 152px wide with 26px gap. Total ~920px.
    box_w = 152
    gap = 26
    n = min(len(nodes), 6)
    total_w = n * box_w + (n - 1) * gap
    # Center it in 920 viewport
    start_x = max(0, (920 - total_w) // 2)
    boxes = []
    arrows = []
    for i, node_text in enumerate(nodes[:n]):
        x = start_x + i * (box_w + gap)
        # Split node text into two lines for wrapping
        words = node_text.split(' ')
        if len(words) > 2 and sum(len(w) for w in words) > 14:
            mid = len(words) // 2
            line1 = ' '.join(words[:mid])
            line2 = ' '.join(words[mid:])
        else:
            line1 = node_text
            line2 = ''
        boxes.append(f'<rect x="{x}" y="41" width="{box_w}" height="48" rx="8" fill="{rgba(accent_color, 0.06)}" stroke="{rgba(accent_color, 0.55)}" stroke-width="1.2"/>')
        text_y_1 = 59 if line2 else 69
        boxes.append(f'<text x="{x + box_w // 2}" y="{text_y_1}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="11" fill="currentColor">{line1}</text>')
        if line2:
            boxes.append(f'<text x="{x + box_w // 2}" y="74" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="11" fill="currentColor">{line2}</text>')
        # Arrow to next box
        if i < n - 1:
            arrow_x1 = x + box_w + 3
            arrow_x2 = x + box_w + gap - 5
            arrows.append(f'<line x1="{arrow_x1}" y1="65" x2="{arrow_x2}" y2="65" stroke="{accent_color}" stroke-width="1.3" stroke-opacity="0.65" marker-end="url(#wf-arr)"/>')
    return f'''      <div class="diagram-label">{label}</div>
      <div class="diagram-wrap"><svg viewBox="0 0 920 130" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;color:var(--text-1)">
        <defs>
          <marker id="wf-arr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="{accent_color}" opacity="0.7"/>
          </marker>
        </defs>
        {"".join(arrows)}
        {"".join(boxes)}
      </svg></div>'''


def render_videos(videos):
    """Render the 2 video cards using native HTML5 <video> with direct mp4."""
    out = []
    for v in videos:
        label = v['label']
        mp4 = v.get('mp4_url', '')
        poster = v.get('thumbnail_data_uri', '')
        if mp4:
            video_el = (
                f'<video class="video-card-native" controls preload="metadata" playsinline '
                f'poster="{poster}"><source src="{mp4}" type="video/mp4">'
                f'Your browser does not support video playback.</video>'
            )
        else:
            # Fallback: clickable poster card linking to source URL
            src_url = v.get('source_url', '#')
            video_el = (
                f'<a class="video-card-native" href="{src_url}" target="_blank" rel="noopener noreferrer" '
                f'style="display:block;background:#000 url({poster}) center/cover no-repeat;text-decoration:none;">'
                f'<span style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;'
                f'font-size:14px;background:rgba(0,0,0,0.4)">▶ Watch on Wistia</span></a>'
            )
        out.append(f'''        <div class="video-wrap fade">
          <div class="video-label">{label}</div>
          {video_el}
        </div>''')
    return '\n'.join(out)


def render_stories_and_modals(stories, calendar_link):
    """Render the story cards section + modals. Returns (cards_html, modals_html)."""
    cards = []
    modals = []
    for i, s in enumerate(stories):
        csr_lines = []
        # Defensive: coerce csr to a list. If the LLM passes a string instead of
        # a list, Python iterates characters and each letter gets its own div.
        raw_csr = s.get('csr', [])
        if isinstance(raw_csr, str):
            # Split on newlines if multi-line string; otherwise wrap as single-item list
            raw_csr = [line.strip() for line in raw_csr.split('\n') if line.strip()]
        for line in raw_csr:
            if ':' in line:
                label, body = line.split(':', 1)
                csr_lines.append(f'<div class="story-csr-line"><span class="story-csr-label">{label.strip()}</span>{body.strip()}</div>')
            else:
                csr_lines.append(f'<div class="story-csr-line">{line}</div>')
        cards.append(f'''        <div class="story-card fade">
          <div class="story-tag">Customer Story</div>
          <div class="story-title">{s["title"]}</div>
          <div class="story-csr">
            {"".join(csr_lines)}
          </div>
          <button class="story-btn" onclick="openStoryModal('story-modal-{i}')">Read story</button>
        </div>''')
        modal_sections = []
        for sec in s.get('modal_sections', []):
            modal_sections.append(f'<div class="story-modal-section"><div class="story-modal-section-label">{sec["label"]}</div><div class="story-modal-body" style="margin-bottom:0">{sec["body"]}</div></div>')
        modals.append(f'''  <div class="story-modal-bg" id="story-modal-{i}" onclick="if(event.target===this)closeStoryModal('story-modal-{i}')">
    <div class="story-modal-panel" role="dialog" aria-modal="true">
      <button class="story-modal-close" onclick="closeStoryModal('story-modal-{i}')" aria-label="Close">&times;</button>
      <div class="story-modal-tag">Customer Story</div>
      <div class="story-modal-headline">{s.get("modal_headline", s["title"])}</div>
      {"".join(modal_sections)}
      <div class="story-modal-cta">
        <a class="btn" href="{calendar_link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 30px;font-size:.9rem">See how this works for your team →</a>
      </div>
    </div>
  </div>''')
    return '\n'.join(cards), '\n'.join(modals)


def build_html(input_data, template_path=TEMPLATE_PATH):
    """Main builder. Takes input dict, returns final HTML string.

    Supports two modes via the 'mode' key in input_data:
      - "prospect" (default): per-prospect page. Requires prospect_name, prospect_title.
        Chip = "FirstName · Title · Account". Nav = "Prepared for FirstName by AE".
      - "account": account-POV page for a whole play. prospect_name/title optional.
        Chip = "Account". Nav = "Prepared for the Account team by AE". No hero photos.
    """
    mode = input_data.get('mode', 'prospect')  # 'prospect' | 'account'
    theme = input_data.get('theme', 'dark')
    brand_color = input_data.get('brand_color', '#2563EB')
    account_domain = input_data.get('account_domain', '')
    ae_name = input_data.get('ae_name', '')
    ae_photo_url = input_data.get('ae_photo_url')
    prospect_name = input_data.get('prospect_name', '')
    prospect_first_name = input_data.get('prospect_first_name') or (prospect_name.split()[0] if prospect_name else '')
    prospect_title = input_data.get('prospect_title', '')
    prospect_photo_url = input_data.get('prospect_photo_url')
    account_name = input_data.get('account_name', '')
    calendar_link = input_data.get('calendar_link', '#')
    headline = input_data.get('headline', '')
    hero_subhead = input_data.get('hero_subhead', '')
    value_headline = input_data.get('value_headline', f'How Airtable changes the way your team operates')
    value_cards = input_data.get('value_cards', [])
    diagram_label = input_data.get('diagram_label', '')
    diagram_nodes = input_data.get('diagram_nodes', [])
    videos = input_data.get('videos', [])
    stories = input_data.get('stories', [])
    proof_quote = input_data.get('proof_quote', '')

    # Compute palette
    palette = compute_palette(theme, brand_color)

    # Fetch favicon
    favicon_uri = fetch_account_favicon(account_domain)
    if not favicon_uri:
        favicon_uri = ''

    # In account mode, skip prospect photos entirely (no single prospect to feature)
    if mode == 'account':
        prospect_photo_uri = None
        ae_photo_uri = None
    else:
        prospect_photo_uri = fetch_image_as_data_uri(prospect_photo_url, max_size=(400, 400)) if prospect_photo_url else None
        ae_photo_uri = fetch_image_as_data_uri(ae_photo_url, max_size=(400, 400)) if ae_photo_url else None

    # Fetch Wistia assets for each video (parallel-eligible — but stdlib doesn't help much here)
    for v in videos:
        if v.get('media_id') and not v.get('mp4_url'):
            assets = fetch_wistia_assets(v['media_id'])
            if assets:
                v['mp4_url'] = assets.get('mp4_url') or v.get('mp4_url')
                v['thumbnail_data_uri'] = assets.get('thumbnail_data_uri') or v.get('thumbnail_data_uri', '')

    # Pick logo SVG
    airtable_logo = AIRTABLE_LOGO_LIGHT if theme == 'light' else AIRTABLE_LOGO_DARK

    # Render sub-components
    hero_photos_block = render_hero_photos(prospect_photo_uri, ae_photo_uri, prospect_first_name, ae_name)
    value_cards_html = render_value_cards(value_cards)
    diagram_html = render_diagram(diagram_label, diagram_nodes, brand_color)
    videos_html = render_videos(videos)
    stories_html, modals_html = render_stories_and_modals(stories, calendar_link)

    # Load template
    with open(template_path, 'r') as f:
        template = f.read()

    # Build substitution dict — mode-aware chip and nav
    if mode == 'account':
        chip_text = f'{account_name} × Airtable' if account_name else 'Airtable'
        nav_prepared = f'Prepared for {account_name} by {ae_name}' if account_name else f'Prepared by {ae_name}'
    else:
        chip_parts = [prospect_first_name]
        if prospect_title:
            chip_parts.append(prospect_title)
        if account_name:
            chip_parts.append(account_name)
        chip_text = ' · '.join(p for p in chip_parts if p)
        nav_prepared = f'Prepared for {prospect_first_name} by {ae_name}' if prospect_first_name else f'Prepared by {ae_name}'

    subs = {
        'theme': theme,
        'theme_comment': f'{theme} ({"brand " if theme == "dark" else ""}accent {brand_color} on {palette["bg"]})',
        'title': f'{headline} | Airtable × {account_name}' if account_name else headline,
        'favicon': favicon_uri,
        'account_name': account_name,
        'account_domain': account_domain,
        'prospect_name': prospect_name,
        'prospect_first_name': prospect_first_name,
        'prospect_title': prospect_title,
        'chip_text': chip_text,
        'nav_prepared': nav_prepared,
        'ae_name': ae_name,
        'calendar_link': calendar_link,
        'headline': headline,
        'headline_js': json.dumps(headline),  # safe JS string literal
        'hero_subhead': hero_subhead,
        'value_headline': value_headline,
        'proof_quote': proof_quote or '',
        'proof_quote_block': f'<div class="proof-quote">"{proof_quote}"</div>' if proof_quote else '',
        'hero_photos_block': hero_photos_block,
        'value_cards': value_cards_html,
        'diagram_block': diagram_html,
        'videos': videos_html,
        'stories': stories_html,
        'story_modals': modals_html,
        'airtable_logo': airtable_logo,
        # CSS palette
        **{f'css_{k}': v for k, v in palette.items()},
    }

    # Substitute {{key}} markers (mustache style)
    def replace_marker(match):
        key = match.group(1).strip()
        if key not in subs:
            return match.group(0)  # leave unmatched markers alone
        return str(subs[key])

    output = re.sub(r'\{\{([a-zA-Z0-9_]+)\}\}', replace_marker, template)
    return output


def main():
    if len(sys.argv) < 2:
        print('Usage: build_landing_page.py INPUT.json [OUTPUT.html]', file=sys.stderr)
        sys.exit(2)
    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) >= 3 else '/agent/workspace/landing_page.html'
    with open(input_path, 'r') as f:
        data = json.load(f)
    html = build_html(data)
    with open(output_path, 'w') as f:
        f.write(html)
    print(f'Wrote {output_path} ({len(html):,} bytes)')


if __name__ == '__main__':
    main()
