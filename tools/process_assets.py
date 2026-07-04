#!/usr/bin/env python3
"""Обработка сгенерированных ассетов:
- кеинг magenta-фона (flood-fill от углов + глобальная хрома-маска для замкнутых областей)
- обрезка по содержимому, даунскейл до игровых размеров, экспорт webp
- нарезка items_sheet 3x3 на отдельные иконки
- тайлы: даунскейл 256px (бесшовность правится отдельно pipeline.py при необходимости)
- иконки PWA из title_bg
- контакт-лист для проверки стиля
Вход: game/assets_raw/<id>.png  Выход: game/assets/<id>.webp
"""
import sys, os, json
import numpy as np
from PIL import Image

RAW = os.path.join(os.path.dirname(__file__), '..', 'assets_raw')
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(OUT, exist_ok=True)

SPRITE_SIZE = 256   # герои/боссы/мобы
SMALL_SIZE = 128    # оружие/шмот/декор мелкий
TILE_SIZE = 256

SPRITES = ['hero_barbarian','hero_huntress','hero_mage','hero_warlock','hero_druid','form_wolf','form_bear',
 'mob_skeleton','mob_zombie','mob_ghoul','mob_bloater','mob_cultist','mob_hound','mob_imp','mob_knight',
 'boss_bone','boss_plague','boss_executioner','boss_abyss','dec_sarcophagus','dec_bones','dec_chest','dec_portal']
SMALL = ['wpn_axe','wpn_greatsword','wpn_bow','wpn_staff','wpn_scythe','wpn_dagger',
 'helm_iron','shield_tower','chest_plate','chest_robe']
TILES = ['tile_crypt','tile_catacomb','tile_torture','tile_hell']
SHEET_ITEMS = ['item_potion','item_potion2','item_gold','item_ring','item_amulet','item_belt','item_boots','item_gloves','item_tome']

def key_out(img):
    """Убрать magenta: хрома-дистанция + flood fill от углов + замкнутые зоны."""
    a = np.asarray(img.convert('RGB')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # магента: R и B высокие, G низкий
    chroma = (r > 120) & (b > 120) & (g < (np.minimum(r, b) * 0.72 - 8))
    # смягчаем: близость к чистой магенте
    d = np.abs(r - 255) + np.abs(g - 0) + np.abs(b - 255)
    strong = d < 260
    mask = chroma | (strong & (g < 110))
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    # полупрозрачная кромка: пиксели, граничащие с маской и имеющие магента-оттенок
    rgba = np.dstack([a.astype(np.uint8), alpha])
    out = Image.fromarray(rgba, 'RGBA')
    # убрать магента-засветку на краях (despill): заменить розовый ореол на нейтральный
    arr = np.asarray(out).copy()
    r2, g2, b2, al = arr[...,0].astype(np.int16), arr[...,1].astype(np.int16), arr[...,2].astype(np.int16), arr[...,3]
    spill = (al > 0) & (r2 > g2 + 60) & (b2 > g2 + 60)
    m = (r2 + b2) // 2
    arr[...,0] = np.where(spill, np.minimum(r2, g2 + 60), r2).astype(np.uint8)
    arr[...,2] = np.where(spill, np.minimum(b2, g2 + 60), b2).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')

def trim(img, pad=6):
    bbox = img.getbbox()
    if not bbox: return img
    l, t, r, b = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(img.width, r + pad); b = min(img.height, b + pad)
    return img.crop((l, t, r, b))

def fit_square(img, size):
    w, h = img.size
    s = max(w, h)
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    canvas.paste(img, ((s - w) // 2, (s - h) // 2))
    return canvas.resize((size, size), Image.LANCZOS)

def coverage(img):
    a = np.asarray(img)[..., 3]
    return (a > 40).mean()

report = {}
for aid in SPRITES + SMALL:
    src = os.path.join(RAW, aid + '.png')
    if not os.path.exists(src):
        report[aid] = 'MISSING'; continue
    img = Image.open(src)
    keyed = key_out(img)
    cov = coverage(keyed)
    keyed = trim(keyed)
    size = SPRITE_SIZE if aid in SPRITES else SMALL_SIZE
    out = fit_square(keyed, size)
    out.save(os.path.join(OUT, aid + '.webp'), 'WEBP', quality=86)
    report[aid] = f'ok cov={cov:.2f}'

for aid in TILES:
    src = os.path.join(RAW, aid + '.png')
    if not os.path.exists(src):
        report[aid] = 'MISSING'; continue
    img = Image.open(src).convert('RGB')
    img = img.resize((TILE_SIZE, TILE_SIZE), Image.LANCZOS)
    # простая проверка шва
    a = np.asarray(img).astype(float)
    seam = abs(a[0]-a[-1]).mean() + abs(a[:,0]-a[:,-1]).mean()
    base = abs(np.diff(a,axis=0)).mean() + abs(np.diff(a,axis=1)).mean()
    ratio = seam / max(base, .001)
    img.save(os.path.join(OUT, aid + '.webp'), 'WEBP', quality=84)
    report[aid] = f'ok seam={ratio:.2f}'

# items sheet -> 9 иконок
src = os.path.join(RAW, 'items_sheet.png')
if os.path.exists(src):
    img = Image.open(src)
    keyed = key_out(img)
    W, H = keyed.size
    for i, name in enumerate(SHEET_ITEMS):
        cx, cy = i % 3, i // 3
        cell = keyed.crop((cx * W // 3, cy * H // 3, (cx + 1) * W // 3, (cy + 1) * H // 3))
        cell = trim(cell, 2)
        fit_square(cell, 96).save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=86)
    report['items_sheet'] = 'ok sliced 9'
else:
    report['items_sheet'] = 'MISSING'

# title + иконки PWA
src = os.path.join(RAW, 'title_bg.png')
if os.path.exists(src):
    img = Image.open(src).convert('RGB')
    img.resize((1280, int(1280 * img.height / img.width)), Image.LANCZOS)\
       .save(os.path.join(OUT, 'title_bg.webp'), 'WEBP', quality=82)
    # квадратная иконка из центра
    s = min(img.size)
    icon = img.crop(((img.width - s)//2, (img.height - s)//2, (img.width + s)//2, (img.height + s)//2))
    icon.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, 'icon-192.png'))
    icon.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-512.png'))
    report['title_bg'] = 'ok + icons'
else:
    report['title_bg'] = 'MISSING'

print(json.dumps(report, indent=1, ensure_ascii=False))
missing = [k for k, v in report.items() if v == 'MISSING']
sys.exit(1 if missing else 0)
