#!/usr/bin/env python3
"""Иконки предметов из листа Flare icons.png (64x64, 8 колонок) -> assets/loot/*.webp.
Рисованные иконки заменяют пиксельные loot-спрайты там, где есть аналог."""
import os
from PIL import Image

FLARE = os.environ.get('FLARE_DIR', '/tmp/claude-0/-home-user-artmore-card/032e5d9d-d2d3-5b78-a445-01d93e169192/scratchpad/flare-game/mods/fantasycore')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'loot')
os.makedirs(OUT, exist_ok=True)

# имя -> (col, row) в сетке 64px
PICK = {
    'dagger': (1, 12), 'sword': (2, 12), 'greatsword': (4, 12),
    'warhammer': (6, 12), 'maul': (7, 12),
    'staff': (0, 13), 'skull_staff': (1, 13), 'greatstaff': (3, 13), 'wand': (5, 13),
    'shortbow': (1, 14), 'longbow': (2, 14), 'greatbow': (3, 14),
    'hand_axe': (5, 14), 'battle_axe': (6, 14), 'great_axe': (7, 14),
    'buckler': (0, 15), 'wood_shield': (1, 15), 'kite_shield': (2, 15), 'crest_shield': (3, 15),
    'cloth_shirt': (1, 16), 'sandals': (4, 16),
    'leather_hood': (0, 17), 'leather_shirt': (1, 17), 'leather_boots': (4, 17),
    'dark_hood': (0, 18), 'leather_armor': (1, 18), 'leather_gloves': (2, 18), 'tall_boots': (4, 18),
    'chain_coif': (0, 19), 'chain_mail': (1, 19), 'chain_gloves': (2, 19), 'chain_boots': (4, 19),
    'plate_helm': (0, 20), 'plate_armor': (1, 20), 'plate_gloves': (2, 20), 'plate_boots': (4, 20),
    'mage_hood': (0, 23), 'mage_vest': (1, 23), 'mage_boots': (4, 23),
    'ring_silver': (6, 24), 'ring_gold': (7, 24),
    'ring_blue': (4, 25), 'ring_green': (5, 25), 'ring_plain': (6, 25), 'ring_ruby': (7, 25),
    'belt2': (0, 26), 'amu_green': (4, 26), 'amu_red': (5, 26), 'amu_blue': (6, 26), 'amu_white': (7, 26),
    'scroll2': (0, 28), 'book2': (1, 28), 'key': (2, 28),
    'potion_g': (0, 10), 'potion_p': (1, 10), 'hp_flask': (4, 10), 'mp_flask': (6, 10),
    'coins': (0, 11),
    'gem_blue': (4, 8), 'gem_green': (5, 8), 'gem_red': (6, 8), 'gem_white': (7, 8),
}

src = Image.open(os.path.join(FLARE, 'images/icons/icons.png')).convert('RGBA')
for name, (c, r) in PICK.items():
    cell = src.crop((c * 64, r * 64, c * 64 + 64, r * 64 + 64))
    cell.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=90)
print('baked', len(PICK), 'icons ->', OUT)
