// Service Worker: полный прекэш — игра работает без сети после первого открытия.
const VERSION = 'lastcandle-v15';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './src/main.js', './src/core.js', './src/data.js', './src/strings.js', './src/items.js',
  './src/world.js', './src/entities.js', './src/skills.js', './src/render.js', './src/ui.js',
  './src/audio.js', './src/save.js', './src/flare.js', './src/act1.js', './assets/flare/meta.json', './assets/flare/tiles.webp',
  './assets/fonts/forum.woff2', './assets/fonts/ruslan.woff2',
];
const LOOT = ['hand_axe', 'battle_axe', 'great_axe', 'greatsword', 'sword', 'shortbow', 'longbow', 'greatbow',
  'staff', 'wand', 'greatstaff', 'skull_staff', 'dagger', 'buckler', 'kite_shield', 'crest_shield', 'book2',
  'leather_hood', 'chain_coif', 'plate_helm', 'leather_armor', 'chain_mail', 'plate_armor', 'mage_vest',
  'leather_gloves', 'chain_gloves', 'plate_gloves', 'belt2', 'leather_boots', 'chain_boots', 'plate_boots',
  'amu_green', 'amu_red', 'amu_blue', 'ring_silver', 'ring_gold', 'ring_ruby',
  'coins', 'hp_flask', 'gem_red'].map(n => './assets/loot/' + n + '.webp');
const SKILLICONS = ['cleave', 'whirlwind', 'leap', 'execute', 'warcry', 'terrify', 'bloodcry', 'ironskin', 'thorns', 'secondwind',
  'multishot', 'pierce', 'volley', 'firetrap', 'frosttrap', 'blasttrap', 'dash', 'poison', 'deadeye',
  'fireball', 'firewall', 'meteor', 'icebolt', 'frostnova', 'shards', 'chain', 'teleport', 'storm',
  'rot', 'weakness', 'harvest', 'skeletons', 'demon', 'masterY', 'bloodspike', 'vamp', 'sacrifice',
  'wolfform', 'rend', 'frenzy', 'bearform', 'maul', 'roar', 'roots', 'swarm', 'heal', 'attack', 'potion'
].map(n => './assets/skills/' + n + '.webp');
const FLARE = ['e_skeleton', 'e_skeleton_mage', 'e_zombie', 'e_goblin', 'e_antlion', 'e_minotaur', 'e_wyvern',
  'n_trader', 'n_guild',
  'm_default_feet', 'm_default_legs', 'm_default_hands', 'm_default_chest', 'm_head_short',
  'm_cloth_shirt', 'm_leather_chest', 'm_chain_cuirass', 'm_plate_cuirass', 'm_mage_vest',
  'm_leather_hood', 'm_chain_coif', 'm_plate_helm', 'm_buckler', 'm_kite_shield',
  'm_battle_axe', 'm_greatsword', 'm_dagger', 'm_staff', 'm_greatstaff',
  'f_default_feet', 'f_default_legs', 'f_default_hands', 'f_default_chest', 'f_head_long',
  'f_cloth_shirt', 'f_leather_chest', 'f_chain_cuirass', 'f_plate_cuirass', 'f_mage_vest',
  'f_leather_hood', 'f_chain_coif', 'f_plate_helm', 'f_greatbow',
].map(n => './assets/flare/' + n + '.webp');
const ASSETS = [
  'hero_barbarian', 'hero_huntress', 'hero_mage', 'hero_warlock', 'hero_druid', 'form_wolf', 'form_bear',
  'mob_skeleton', 'mob_zombie', 'mob_ghoul', 'mob_bloater', 'mob_cultist', 'mob_hound', 'mob_imp', 'mob_knight',
  'boss_bone', 'boss_plague', 'boss_executioner', 'boss_abyss',
  'wpn_axe', 'wpn_greatsword', 'wpn_bow', 'wpn_staff', 'wpn_scythe', 'wpn_dagger',
  'helm_iron', 'shield_tower', 'chest_plate', 'chest_robe',
  'item_potion', 'item_potion2', 'item_gold', 'item_ring', 'item_amulet', 'item_belt', 'item_boots', 'item_gloves', 'item_tome',
  'tile_crypt', 'tile_catacomb', 'tile_torture', 'tile_hell',
  'dec_sarcophagus', 'dec_bones', 'dec_chest', 'dec_portal', 'title_bg', 'icon-192', 'icon-512',
].map(a => './assets/' + a + (a.startsWith('icon') ? '.png' : '.webp'));

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // ядро обязано закэшироваться; ассеты — сколько получится (отсутствующие не валят установку)
    await cache.addAll(CORE);
    await Promise.allSettled([...ASSETS, ...FLARE, ...LOOT, ...SKILLICONS].map(u => cache.add(u)));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const resp = await fetch(e.request);
      if (resp.ok && new URL(e.request.url).origin === location.origin) {
        const cache = await caches.open(VERSION);
        cache.put(e.request, resp.clone());
      }
      return resp;
    } catch {
      return cached || Response.error();
    }
  })());
});
