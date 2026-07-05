#!/usr/bin/env python3
"""Конвертер арта Flare (CC-BY-SA, flareteam/flare-game) в листы игры.
Формат Flare: атлас PNG + txt с секциями [stance][run][swing][cast][shoot][die],
строки frame=<кадр>,<направление 0-7>,x,y,w,h,ox,oy (ox,oy — якорь).
Выход: assets/flare/<name>.webp (строки=5 направлений, колонки=кадры подряд)
и общий assets/flare/meta.json. Направления E/NE/SE зеркалятся из W/NW/SW в рантайме.
"""
import os, sys, json, re
from PIL import Image, ImageEnhance, ImageFilter, ImageChops

# единый грейдинг (план А): одна кривая контраста, приглушение пестроты,
# тёплый сдвиг «свет свечи», лёгкий шарп и тёмный 1px контур для читаемости на тёмном полу
WARM = (255, 214, 150)
def grade_sheet(sheet, outline=True):
    a = sheet.getchannel('A')
    rgb = sheet.convert('RGB')
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.4, percent=70, threshold=2))
    rgb = ImageEnhance.Contrast(rgb).enhance(1.07)
    rgb = ImageEnhance.Color(rgb).enhance(0.93)
    mul = ImageChops.multiply(rgb, Image.new('RGB', rgb.size, WARM))
    rgb = Image.blend(rgb, mul, 0.10)
    out = rgb.convert('RGBA'); out.putalpha(a)
    if not outline: return out
    mask = a.point(lambda v: 255 if v > 40 else 0)
    dil = mask.filter(ImageFilter.MaxFilter(3))
    edge = ImageChops.subtract(dil, mask)
    ol = Image.new('RGBA', sheet.size, (16, 11, 6, 255)); ol.putalpha(edge.point(lambda v: 210 if v else 0))
    base = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
    base.alpha_composite(ol)
    base.alpha_composite(out)
    return base

FLARE = os.environ.get('FLARE_DIR', '/tmp/claude-0/-home-user-artmore-card/032e5d9d-d2d3-5b78-a445-01d93e169192/scratchpad/flare-game/mods/fantasycore')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'flare')
os.makedirs(OUT, exist_ok=True)

SCALE = 0.6
ANIMS = ['stance', 'run', 'swing', 'cast', 'shoot', 'die']
# какие направления печём (индексы Flare), остальные зеркалим в рантайме.
# Проверено визуально: 0=W, 1=SW, 2=S, 3=SE, 4=E, 5=NE, 6=N, 7=NW (экранные, y вниз).
# Ряды листа: 0=S, 1=SW, 2=W, 3=NW, 4=N; SE/E/NE зеркалятся из SW/W/NW.
KEEP_DIRS = [2, 1, 0, 7, 6]

def parse_anim(txt_path):
    images, anims, cur = {}, {}, None  # images: alias -> путь ('' = единственный)
    for line in open(txt_path):
        line = line.strip()
        if not line or line.startswith('#'): continue
        if line.startswith('image='):
            v = line.split('=', 1)[1]
            if ',' in v:
                path, alias = v.split(',', 1)
                images[alias] = path
            else:
                images[''] = v
        m = re.match(r'\[(\w+)\]', line)
        if m:
            cur = m.group(1)
            anims[cur] = {'frames': 0, 'duration': 500, 'type': 'looped', 'rects': {}}
            continue
        if cur is None: continue
        if line.startswith('frames='): anims[cur]['frames'] = int(line.split('=')[1])
        elif line.startswith('duration='):
            v = line.split('=')[1]
            anims[cur]['duration'] = int(re.sub(r'\D', '', v)) if 'ms' in v else int(float(re.sub(r'[^\d.]', '', v)) * 1000)
        elif line.startswith('type='): anims[cur]['type'] = line.split('=')[1]
        elif line.startswith('frame='):
            parts = line.split('=')[1].split(',')
            alias = ''
            if len(parts) == 9: alias = parts[8]
            fi, di, x, y, w, h, ox, oy = [int(x) for x in parts[:8]]
            anims[cur]['rects'][(fi, di)] = (x, y, w, h, ox, oy, alias)
    return images, anims

def bake(name, txt_rel, out_name=None, anims_keep=None):
    txt_path = os.path.join(FLARE, txt_rel)
    images, anims = parse_anim(txt_path)
    srcs = {alias: Image.open(os.path.join(FLARE, p)).convert('RGBA') for alias, p in images.items()}
    keep = [a for a in (anims_keep or ANIMS) if a in anims and anims[a]['frames'] > 0]
    # габариты ячейки вокруг якоря
    L = R = U = D = 1
    for a in keep:
        A = anims[a]
        for (fi, di), (x, y, w, h, ox, oy, alias) in A['rects'].items():
            if di not in KEEP_DIRS: continue
            L = max(L, ox); R = max(R, w - ox); U = max(U, oy); D = max(D, h - oy)
    cw, ch = int((L + R) * SCALE) + 2, int((U + D) * SCALE) + 2
    ax, ay = int(L * SCALE) + 1, int(U * SCALE) + 1
    total = sum(anims[a]['frames'] for a in keep)
    sheet = Image.new('RGBA', (cw * total, ch * len(KEEP_DIRS)), (0, 0, 0, 0))
    meta = {'cw': cw, 'ch': ch, 'ax': ax, 'ay': ay, 'anims': {}}
    col = 0
    for a in keep:
        A = anims[a]
        meta['anims'][a] = {'start': col, 'frames': A['frames'], 'dur': A['duration'], 'type': A['type']}
        for f in range(A['frames']):
            for row, di in enumerate(KEEP_DIRS):
                r = A['rects'].get((f, di))
                if not r: continue
                x, y, w, h, ox, oy, alias = r
                src = srcs.get(alias) or next(iter(srcs.values()))
                crop = src.crop((x, y, x + w, y + h))
                sw, sh = max(1, int(w * SCALE)), max(1, int(h * SCALE))
                crop = crop.resize((sw, sh), Image.LANCZOS)
                px = (col + f) * cw + ax - int(ox * SCALE)
                py = row * ch + ay - int(oy * SCALE)
                sheet.alpha_composite(crop, (max(0, px), max(0, py)))
        col += A['frames']
    out = out_name or name
    sheet = grade_sheet(sheet)
    sheet.save(os.path.join(OUT, out + '.webp'), 'WEBP', quality=82)
    return out, meta, sheet.size

JOBS = []
# --- враги ---
for flare_name, out in [('skeleton', 'e_skeleton'), ('skeleton_mage', 'e_skeleton_mage'), ('zombie', 'e_zombie'),
                        ('goblin', 'e_goblin'), ('antlion', 'e_antlion'), ('minotaur', 'e_minotaur')]:
    JOBS.append((flare_name, f'animations/enemies/{flare_name}.txt', out, None))
JOBS.append(('wyvern_fire', 'animations/enemies/wyvern_fire.txt', 'e_wyvern', None))
# --- NPC города (только stance) ---
for flare_name, out in [('wandering_trader', 'n_trader'), ('guild_man', 'n_guild'),
                        ('peasant_man1', 'n_peasant'), ('knight', 'n_knight')]:
    JOBS.append((flare_name, f'animations/npcs/{flare_name}.txt', out, ['stance']))
# --- герой: мужские слои ---
MALE = ['default_feet', 'default_legs', 'default_hands', 'default_chest', 'head_short',
        'cloth_shirt', 'leather_chest', 'chain_cuirass', 'plate_cuirass', 'mage_vest',
        'leather_hood', 'chain_coif', 'plate_helm', 'buckler', 'kite_shield',
        'battle_axe', 'greatsword', 'dagger', 'staff', 'greatstaff']
for l in MALE:
    JOBS.append((l, f'animations/avatar/male/{l}.txt', 'm_' + l, None))
# --- героиня: женские слои ---
FEMALE = ['default_feet', 'default_legs', 'default_hands', 'default_chest', 'head_long',
          'cloth_shirt', 'leather_chest', 'chain_cuirass', 'plate_cuirass', 'mage_vest',
          'leather_hood', 'chain_coif', 'plate_helm', 'greatbow']
for l in FEMALE:
    JOBS.append((l, f'animations/avatar/female/{l}.txt', 'f_' + l, None))

if __name__ == '__main__':
    only = set(sys.argv[1:])
    metas = {}
    if os.path.exists(os.path.join(OUT, 'meta.json')):
        metas = json.load(open(os.path.join(OUT, 'meta.json')))
    for name, txt, out, keep in JOBS:
        if only and out not in only: continue
        try:
            o, meta, size = bake(name, txt, out, keep)
            metas[o] = meta
            print(f'{o}: {size[0]}x{size[1]} cell {meta["cw"]}x{meta["ch"]}')
        except FileNotFoundError as e:
            print(f'{out}: SKIP ({e})')
    json.dump(metas, open(os.path.join(OUT, 'meta.json'), 'w'))
    print('meta.json:', len(metas), 'sheets')
