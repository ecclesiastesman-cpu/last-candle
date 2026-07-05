#!/usr/bin/env python3
"""Иконки умений из game-icons.net (CC-BY 3.0, авторы Lorc и Delapouite).
SVG -> золото на прозрачном -> assets/skills/<skill_id>.webp (64px).
Кандидаты перечислены по приоритету; берётся первый существующий."""
import os, io
import cairosvg
from PIL import Image

GI = os.environ.get('GI_DIR', '/tmp/claude-0/-home-user-artmore-card/032e5d9d-d2d3-5b78-a445-01d93e169192/scratchpad/gi_test')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'skills')
os.makedirs(OUT, exist_ok=True)

GOLD = '#d9cba3'

MAP = {
  # варвар
  'cleave': ['serrated-slash', 'axe-swing'], 'whirlwind': ['whirlwind'], 'leap': ['jump-across', 'leapfrog'],
  'execute': ['decapitation', 'bloody-sword'], 'warcry': ['sonic-shout', 'shouting'], 'terrify': ['terror'],
  'bloodcry': ['bleeding-wound', 'bloody-stash'], 'ironskin': ['shield-reflect', 'armor-vest'],
  'thorns': ['spiked-armor', 'barbed-coil'], 'secondwind': ['mighty-force', 'heart-beats'],
  # охотница
  'multishot': ['double-shot', 'arrow-cluster'], 'pierce': ['supersonic-arrow', 'broadhead-arrow'],
  'volley': ['arrow-flights', 'striking-arrows'], 'firetrap': ['flaming-trident', 'kindle'],
  'frosttrap': ['frozen-orb', 'ice-spikes'], 'blasttrap': ['land-mine', 'unstable-orb'],
  'dash': ['sprint', 'wingfoot'], 'poison': ['poison-bottle', 'deathcab'], 'deadeye': ['bullseye', 'arrow-scope'],
  # маг
  'fireball': ['fireball'], 'firewall': ['fire-wave', 'flame-tunnel'], 'meteor': ['burning-meteor', 'meteor-impact'],
  'icebolt': ['ice-bolt', 'frozen-arrow'], 'frostnova': ['ice-spell-cast', 'snowflake-2'],
  'shards': ['ice-spikes', 'crystal-shine'], 'chain': ['chain-lightning', 'lightning-arc'],
  'teleport': ['teleport'], 'storm': ['lightning-storm', 'lightning-branches'],
  # чернокнижник
  'rot': ['death-zone', 'poison-gas'], 'weakness': ['broken-bone', 'cursed-star'],
  'harvest': ['scythe', 'grim-reaper'], 'skeletons': ['skeleton', 'graveyard'],
  'demon': ['daemon-skull', 'evil-minion'], 'masterY': ['crowned-skull', 'death-note'],
  'bloodspike': ['bloody-stash', 'needle-drill'], 'vamp': ['vampire-dracula', 'bat-blade'],
  'sacrifice': ['sacrificial-dagger', 'bleeding-heart'],
  # друид
  'wolfform': ['wolf-head', 'wolf-howl'], 'rend': ['claw-slashes', 'grasping-claws'],
  'frenzy': ['totem-head', 'enrage'], 'bearform': ['bear-head', 'bear-face'],
  'maul': ['bear-face', 'paw'], 'roar': ['lion-roar', 'sonic-shout'],
  'roots': ['roots', 'vine-whip'], 'swarm': ['insect-jaws', 'wasp-sting'], 'heal': ['healing', 'health-increase'],
  # базовая атака и зелье
  'attack': ['sword-brandish', 'crossed-swords'], 'potion': ['health-potion'],
}

def find_svg(name):
    for author in ('lorc', 'delapouite'):
        p = os.path.join(GI, author, name + '.svg')
        if os.path.exists(p): return p
    return None

if __name__ == '__main__':
    missing = []
    for sid, cands in MAP.items():
        path = None
        for c in cands:
            path = find_svg(c)
            if path: break
        if not path: missing.append((sid, cands)); continue
        svg = open(path).read()
        svg = svg.replace('fill="#000"', 'fill="none"').replace('fill="#000000"', 'fill="none"')
        svg = svg.replace('fill="#fff"', f'fill="{GOLD}"').replace('fill="#ffffff"', f'fill="{GOLD}"')
        png = cairosvg.svg2png(bytestring=svg.encode(), output_width=64, output_height=64)
        Image.open(io.BytesIO(png)).convert('RGBA').save(os.path.join(OUT, sid + '.webp'), 'WEBP', quality=90)
    print('baked', len(MAP) - len(missing), 'missing:', missing)
