#!/usr/bin/env python3
"""Спасательная графика (ассеты по формуле стиля, процедурная техника):
1) decals: сцены -> круглые декали пола с радиальным затуханием (сундук, кости, саркофаг, портал)
2) figures: живописные силуэты монстров/героев (слои, контур, свет свечи, шум)
3) gear: оружие/шлем/щит/доспех — стилизованные предметы
Пишет прямо в game/assets/<id>.webp (поверх негодных).
"""
import os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(__file__)
RAW = os.path.join(HERE, '..', 'assets_raw')
OUT = os.path.join(HERE, '..', 'assets')
random.seed(7)

UMBER = (36, 26, 18)      # тёмно-умбровый контур
BONE = (216, 205, 180)
BLOOD = (110, 18, 28)
MOSS = (58, 72, 44)
EMBER = (255, 140, 40)
CHAR = (24, 26, 30)       # угольный

def grain(img, amount=10):
    a = np.asarray(img).astype(np.int16)
    noise = np.random.randint(-amount, amount + 1, a.shape[:2])[..., None]
    rgb = np.clip(a[..., :3] + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, a[..., 3].astype(np.uint8)]), 'RGBA')

def radial_decal(src_name, out_name, size=256, zoom=1.0):
    p = os.path.join(RAW, src_name + '.png')
    if not os.path.exists(p): return False
    img = Image.open(p).convert('RGB')
    s = int(min(img.size) * .72 / zoom)
    cx, cy = img.width // 2, int(img.height * .55)
    img = img.crop((cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2)).resize((size, size), Image.LANCZOS)
    # радиальная альфа
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2) / (size / 2)
    alpha = np.clip((1 - d) * 2.4, 0, 1) ** 1.2 * 255
    rgba = np.dstack([np.asarray(img), alpha.astype(np.uint8)])
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, out_name + '.webp'), 'WEBP', quality=84)
    return True

# ---------- живописная фигура ----------
def paint_figure(spec, size=256):
    """spec: dict(kind, palette, eyes, extra)"""
    S = size * 2  # рисуем крупно, потом даунскейл = живописная мягкость
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, base = S // 2, int(S * .88)
    top = int(S * .16)
    body_c = spec['body']; cloak = spec.get('cloak', body_c)
    def darker(c, f): return tuple(max(0, int(v * f)) for v in c)
    def lighter(c, f): return tuple(min(255, int(v + (255 - v) * f)) for v in c)
    w = spec.get('width', .34)

    if spec['kind'] == 'cloaked':  # балахон: маг/чернокнижник/культист
        pts = [(cx, top)]
        for t in range(1, 11):
            f = t / 10
            wob = math.sin(f * 9 + spec.get('seed', 0)) * S * .012
            pts.append((cx + S * w * (f ** .8) + wob, top + (base - top) * f))
        for t in range(10, 0, -1):
            f = t / 10
            wob = math.cos(f * 7 + spec.get('seed', 0)) * S * .012
            pts.append((cx - S * w * (f ** .8) + wob, top + (base - top) * f))
        d.polygon(pts, fill=cloak, outline=UMBER, width=int(S * .012))
        # капюшон
        hw = S * .14
        d.ellipse([cx - hw, top - hw * .3, cx + hw, top + hw * 1.9], fill=darker(cloak, .8), outline=UMBER, width=int(S * .012))
        d.ellipse([cx - hw * .72, top + hw * .34, cx + hw * .72, top + hw * 1.7], fill=(8, 6, 8))
    elif spec['kind'] == 'brute':  # зомби/рыцарь/палач: массивный торс
        d.ellipse([cx - S * w, S * .3, cx + S * w, base], fill=body_c, outline=UMBER, width=int(S * .013))
        d.ellipse([cx - S * .13, S * .16, cx + S * .13, S * .38], fill=lighter(body_c, .07), outline=UMBER, width=int(S * .012))
        for sgn in (-1, 1):  # лапы
            d.ellipse([cx + sgn * S * w - S * .09, S * .42, cx + sgn * S * w + S * .09, S * .78],
                      fill=darker(body_c, .85), outline=UMBER, width=int(S * .01))
    elif spec['kind'] == 'beast':  # гуль/гончая/волк: пригнувшийся зверь
        d.ellipse([cx - S * .36, S * .42, cx + S * .3, S * .78], fill=body_c, outline=UMBER, width=int(S * .013))
        d.ellipse([cx + S * .12, S * .3, cx + S * .42, S * .56], fill=lighter(body_c, .06), outline=UMBER, width=int(S * .012))
        for i in range(3):  # лапы
            x = cx - S * .24 + i * S * .18
            d.polygon([(x, S * .7), (x + S * .06, S * .7), (x + S * .03, base)], fill=darker(body_c, .8), outline=UMBER)
        d.polygon([(cx + S * .3, S * .38), (cx + S * .44, S * .3), (cx + S * .38, S * .44)], fill=body_c, outline=UMBER)  # ухо/рог
    elif spec['kind'] == 'skeleton':
        # череп, рёбра
        d.ellipse([cx - S * .11, S * .14, cx + S * .11, S * .34], fill=BONE, outline=UMBER, width=int(S * .012))
        d.rectangle([cx - S * .05, S * .32, cx + S * .05, S * .4], fill=BONE, outline=UMBER)
        d.ellipse([cx - S * .2, S * .38, cx + S * .2, S * .66], fill=darker(BONE, .92), outline=UMBER, width=int(S * .012))
        for i in range(3):
            y = S * .42 + i * S * .07
            d.arc([cx - S * .17, y, cx + S * .17, y + S * .1], 200, 340, fill=UMBER, width=int(S * .012))
        for sgn in (-1, 1):
            d.line([(cx + sgn * S * .18, S * .42), (cx + sgn * S * .3, S * .7)], fill=BONE, width=int(S * .035))
            d.line([(cx + sgn * S * .07, S * .64), (cx + sgn * S * .1, base)], fill=BONE, width=int(S * .04))
    elif spec['kind'] == 'blob':  # раздутый труп / мать чумы
        d.ellipse([cx - S * .34, S * .3, cx + S * .34, base], fill=body_c, outline=UMBER, width=int(S * .014))
        for i in range(6):  # нарывы
            bx = cx + math.cos(i * 2.4) * S * .2; by = S * .55 + math.sin(i * 1.7) * S * .18
            r = S * (.03 + (i % 3) * .012)
            d.ellipse([bx - r, by - r, bx + r, by + r], fill=lighter(MOSS, .25), outline=darker(MOSS, .6))
        d.ellipse([cx - S * .1, S * .22, cx + S * .1, S * .4], fill=darker(body_c, .8), outline=UMBER, width=int(S * .012))
    elif spec['kind'] == 'imp':
        d.ellipse([cx - S * .18, S * .36, cx + S * .18, S * .74], fill=body_c, outline=UMBER, width=int(S * .013))
        d.ellipse([cx - S * .13, S * .18, cx + S * .13, S * .42], fill=lighter(body_c, .08), outline=UMBER, width=int(S * .012))
        for sgn in (-1, 1):  # рога и крылья
            d.polygon([(cx + sgn * S * .08, S * .2), (cx + sgn * S * .17, S * .07), (cx + sgn * S * .13, S * .22)], fill=darker(body_c, .6), outline=UMBER)
            d.polygon([(cx + sgn * S * .16, S * .42), (cx + sgn * S * .42, S * .3), (cx + sgn * S * .3, S * .56)], fill=darker(body_c, .55), outline=UMBER)
        d.line([(cx + S * .1, S * .72), (cx + S * .3, S * .88)], fill=darker(body_c, .7), width=int(S * .02))
    elif spec['kind'] == 'bear':
        d.ellipse([cx - S * .34, S * .3, cx + S * .34, base], fill=body_c, outline=UMBER, width=int(S * .014))
        d.ellipse([cx - S * .17, S * .12, cx + S * .17, S * .4], fill=lighter(body_c, .05), outline=UMBER, width=int(S * .012))
        for sgn in (-1, 1):
            d.ellipse([cx + sgn * S * .15 - S * .045, S * .1, cx + sgn * S * .15 + S * .045, S * .19], fill=body_c, outline=UMBER)
    # глаза-угли (две точки)
    ey = spec.get('eyeY', .26); ex = spec.get('eyeDX', .05)
    ec = spec.get('eyes', EMBER)
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0)); gd = ImageDraw.Draw(glow)
    for sgn in (-1, 1):
        x, y = cx + sgn * S * ex, S * ey
        r = S * .022
        gd.ellipse([x - r * 2.4, y - r * 2.4, x + r * 2.4, y + r * 2.4], fill=ec + (70,))
        gd.ellipse([x - r, y - r, x + r, y + r], fill=ec + (255,))
    glow = glow.filter(ImageFilter.GaussianBlur(S * .004))
    img.alpha_composite(glow)
    # тёплый свет свечи слева-сверху: мягкий блик
    hl = Image.new('RGBA', (S, S), (0, 0, 0, 0)); hd = ImageDraw.Draw(hl)
    hd.ellipse([cx - S * .3, S * .1, cx + S * .05, S * .6], fill=(255, 190, 110, 26))
    img.alpha_composite(hl.filter(ImageFilter.GaussianBlur(S * .05)))
    img = grain(img, 9)
    return img.resize((size, size), Image.LANCZOS)

def paint_gear(kind, size=128):
    S = size * 2
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    steel = (150, 150, 160); wood = (86, 60, 36); dsteel = (90, 92, 100)
    ow = int(S * .02)
    if kind == 'axe':
        d.line([(S * .5, S * .16), (S * .5, S * .9)], fill=wood, width=int(S * .06))
        d.pieslice([S * .18, S * .06, S * .78, S * .56], 100, 260, fill=steel, outline=UMBER, width=ow)
    elif kind == 'greatsword':
        d.polygon([(S * .5, S * .04), (S * .58, S * .16), (S * .56, S * .68), (S * .44, S * .68), (S * .42, S * .16)], fill=steel, outline=UMBER, width=ow)
        d.line([(S * .3, S * .7), (S * .7, S * .7)], fill=dsteel, width=int(S * .05))
        d.line([(S * .5, S * .7), (S * .5, S * .94)], fill=wood, width=int(S * .05))
    elif kind == 'bow':
        d.arc([S * .2, S * .08, S * .85, S * .92], 300, 60, fill=wood, width=int(S * .05))
        d.line([(S * .72, S * .1), (S * .72, S * .9)], fill=BONE, width=int(S * .015))
    elif kind == 'staff':
        d.line([(S * .46, S * .12), (S * .54, S * .92)], fill=wood, width=int(S * .06))
        d.ellipse([S * .36, S * .02, S * .62, S * .28], outline=wood, width=int(S * .045))
        d.ellipse([S * .43, S * .09, S * .55, S * .21], fill=EMBER)
    elif kind == 'scythe':
        d.line([(S * .42, S * .1), (S * .58, S * .92)], fill=wood, width=int(S * .055))
        d.arc([S * .1, S * .0, S * .9, S * .5], 160, 330, fill=steel, width=int(S * .06))
    elif kind == 'dagger':
        d.polygon([(S * .5, S * .1), (S * .58, S * .26), (S * .54, S * .6), (S * .46, S * .6), (S * .42, S * .26)], fill=steel, outline=UMBER, width=ow)
        d.line([(S * .36, S * .62), (S * .64, S * .62)], fill=dsteel, width=int(S * .045))
        d.line([(S * .5, S * .62), (S * .5, S * .86)], fill=(30, 22, 26), width=int(S * .05))
    elif kind == 'helm':
        d.pieslice([S * .22, S * .2, S * .78, S * .86], 180, 360, fill=steel, outline=UMBER, width=ow)
        d.rectangle([S * .22, S * .52, S * .78, S * .62], fill=dsteel, outline=UMBER)
        for sgn in (-1, 1):
            d.polygon([(S * .5 + sgn * S * .26, S * .42), (S * .5 + sgn * S * .44, S * .12), (S * .5 + sgn * S * .32, S * .48)], fill=BONE, outline=UMBER)
    elif kind == 'shield':
        d.polygon([(S * .5, S * .1), (S * .82, S * .24), (S * .74, S * .66), (S * .5, S * .9), (S * .26, S * .66), (S * .18, S * .24)], fill=dsteel, outline=UMBER, width=ow)
        d.ellipse([S * .42, S * .34, S * .58, S * .52], fill=BONE, outline=UMBER)
    elif kind == 'plate':
        d.polygon([(S * .28, S * .18), (S * .72, S * .18), (S * .78, S * .5), (S * .62, S * .84), (S * .38, S * .84), (S * .22, S * .5)], fill=steel, outline=UMBER, width=ow)
        d.line([(S * .5, S * .2), (S * .5, S * .82)], fill=dsteel, width=int(S * .02))
    elif kind == 'robe':
        d.polygon([(S * .38, S * .12), (S * .62, S * .12), (S * .74, S * .88), (S * .26, S * .88)], fill=(38, 28, 44), outline=UMBER, width=ow)
        d.line([(S * .5, S * .14), (S * .5, S * .86)], fill=(70, 50, 90), width=int(S * .02))
    img = grain(img, 7)
    return img.resize((size, size), Image.LANCZOS)

FIGURES = {
  'hero_huntress': dict(kind='cloaked', body=(52, 60, 46), cloak=(52, 60, 46), eyes=(220, 230, 200), width=.26, seed=1),
  'hero_mage': dict(kind='cloaked', body=(46, 42, 66), cloak=(46, 42, 66), eyes=(120, 180, 255), width=.3, seed=2),
  'hero_warlock': dict(kind='cloaked', body=(40, 30, 40), cloak=(40, 30, 40), eyes=(180, 120, 255), width=.32, seed=3),
  'hero_druid': dict(kind='cloaked', body=(64, 52, 34), cloak=(64, 52, 34), eyes=(140, 220, 120), width=.31, seed=4),
  'form_wolf': dict(kind='beast', body=(70, 62, 54), eyes=(255, 200, 80), eyeY=.38, eyeDX=.2),
  'form_bear': dict(kind='bear', body=(78, 58, 40), eyes=(255, 180, 60), eyeY=.2),
  'mob_skeleton': dict(kind='skeleton', body=BONE, eyes=EMBER, eyeY=.22, eyeDX=.045),
  'mob_zombie': dict(kind='brute', body=(84, 96, 66), eyes=(200, 220, 140), width=.3, eyeY=.24),
  'mob_ghoul': dict(kind='beast', body=(168, 160, 140), eyes=(255, 90, 60), eyeY=.36, eyeDX=.22),
  'mob_bloater': dict(kind='blob', body=(120, 116, 78), eyes=(220, 230, 120), eyeY=.28),
  'mob_cultist': dict(kind='cloaked', body=(58, 40, 40), cloak=(58, 40, 40), eyes=(255, 120, 80), width=.3, seed=5),
  'mob_hound': dict(kind='beast', body=(60, 34, 28), eyes=EMBER, eyeY=.36, eyeDX=.2),
  'mob_imp': dict(kind='imp', body=(140, 60, 40), eyes=(255, 220, 120), eyeY=.26),
  'mob_knight': dict(kind='brute', body=(48, 48, 58), eyes=(255, 60, 40), width=.34, eyeY=.22),
  'boss_bone': dict(kind='skeleton', body=BONE, eyes=(120, 220, 255), eyeY=.2, eyeDX=.05),
  'boss_plague': dict(kind='blob', body=(104, 110, 70), eyes=(230, 240, 130), eyeY=.26),
  'boss_executioner': dict(kind='brute', body=(52, 36, 40), eyes=(255, 80, 50), width=.38, eyeY=.2),
  'boss_abyss': dict(kind='imp', body=(90, 30, 30), eyes=(255, 200, 90), eyeY=.24),
}
GEAR = { 'wpn_axe': 'axe', 'wpn_greatsword': 'greatsword', 'wpn_bow': 'bow', 'wpn_staff': 'staff',
  'wpn_scythe': 'scythe', 'wpn_dagger': 'dagger', 'helm_iron': 'helm', 'shield_tower': 'shield',
  'chest_plate': 'plate', 'chest_robe': 'robe' }
DECALS = { 'dec_sarcophagus': 1.0, 'dec_bones': 1.0, 'dec_chest': 1.15, 'dec_portal': 1.0 }

if __name__ == '__main__':
    import sys
    only = set(sys.argv[1:])
    done = []
    for aid, spec in FIGURES.items():
        if only and aid not in only: continue
        paint_figure(spec).save(os.path.join(OUT, aid + '.webp'), 'WEBP', quality=86); done.append(aid)
    for aid, kind in GEAR.items():
        if only and aid not in only: continue
        paint_gear(kind).save(os.path.join(OUT, aid + '.webp'), 'WEBP', quality=86); done.append(aid)
    for aid, zoom in DECALS.items():
        if only and aid not in only: continue
        if radial_decal(aid, aid, zoom=zoom): done.append(aid)
    print('rewritten:', len(done), done)
