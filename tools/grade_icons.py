#!/usr/bin/env python3
"""Единый грейдинг иконок предметов: одна кривая контраста, лёгкая тёплая тонировка,
тёмный 1px контур и мягкая тень — чтобы весь лут читался как один комплект.
Прогоняется по загружаемому набору (см. main.js), исходники берутся заново из icons.png."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageEnhance, ImageFilter
import bake_icons  # пересоберёт чистые исходники в assets/loot

HERE = os.path.dirname(os.path.abspath(__file__))
LOOT = os.path.join(HERE, '..', 'assets', 'loot')

# набор, который реально грузит игра
USED = ['hand_axe', 'battle_axe', 'great_axe', 'greatsword', 'sword', 'shortbow', 'longbow', 'greatbow',
        'staff', 'wand', 'greatstaff', 'skull_staff', 'dagger', 'buckler', 'kite_shield', 'crest_shield', 'book2',
        'leather_hood', 'chain_coif', 'plate_helm', 'leather_armor', 'chain_mail', 'plate_armor', 'mage_vest',
        'leather_gloves', 'chain_gloves', 'plate_gloves', 'belt2', 'leather_boots', 'chain_boots', 'plate_boots',
        'amu_green', 'amu_red', 'amu_blue', 'ring_silver', 'ring_gold', 'ring_ruby',
        'coins', 'hp_flask', 'gem_red']

WARM = (255, 214, 150)  # тёплый свет свечи

def grade(im):
    im = im.convert('RGBA')
    a = im.getchannel('A')
    rgb = im.convert('RGB')
    # единая кривая: чуть больше контраста, чуть меньше пестроты
    rgb = ImageEnhance.Contrast(rgb).enhance(1.09)
    rgb = ImageEnhance.Color(rgb).enhance(0.92)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.02)
    # тёплый сдвиг (свет свечи): мягкое умножение на тёплый тон, 12%
    warm = Image.new('RGB', rgb.size, WARM)
    from PIL import ImageChops
    mul = ImageChops.multiply(rgb, warm)
    rgb = Image.blend(rgb, mul, 0.12)
    out = rgb.convert('RGBA'); out.putalpha(a)
    # тёмный контур: расширенная альфа под низ
    mask = a.point(lambda v: 255 if v > 36 else 0)
    dil = mask.filter(ImageFilter.MaxFilter(3))
    outline = Image.new('RGBA', im.size, (14, 10, 5, 255))
    outline.putalpha(dil)
    base = Image.new('RGBA', im.size, (0, 0, 0, 0))
    base.alpha_composite(outline)
    # мягкая тень вниз-вправо
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
    shm = mask.filter(ImageFilter.GaussianBlur(1.6))
    black = Image.new('RGBA', im.size, (0, 0, 0, 110)); black.putalpha(shm.point(lambda v: v * 110 // 255))
    sh.alpha_composite(black, (1, 2))
    canvas = Image.new('RGBA', im.size, (0, 0, 0, 0))
    canvas.alpha_composite(sh)
    canvas.alpha_composite(base)
    canvas.alpha_composite(out)
    return canvas

if __name__ == '__main__':
    n = 0
    for name in USED:
        p = os.path.join(LOOT, name + '.webp')
        if not os.path.exists(p): print('SKIP', name); continue
        grade(Image.open(p)).save(p, 'WEBP', quality=92)
        n += 1
    print('graded', n, 'icons')
