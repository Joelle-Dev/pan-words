// 英语词形归并（lemma）。
//
// 三条原则：
//   1. 归并只用于「查重」和「覆盖率计算」，永远不改变用户看到的词形。
//   2. 后缀剥离的结果必须在已知词表中出现才采纳，避免 desk -> des。
//   3. 不可归并时保留原形，并允许用户手动指定 lemma。

export function normalizeWord(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/^[^a-z]+|[^a-z']+$/g, '')
    .replace(/'{2,}/g, "'");
}

// 常见不规则变化。value 为 lemma。
export const IRREGULAR = Object.freeze({
  // be
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  // have / do
  has: 'have', had: 'have', having: 'have',
  does: 'do', did: 'do', done: 'do', doing: 'do',
  // go
  goes: 'go', went: 'go', gone: 'go', going: 'go',
  // say / see / make / take / come / know / get / give / find / think
  said: 'say',
  saw: 'see', seen: 'see',
  made: 'make',
  took: 'take', taken: 'take',
  came: 'come',
  knew: 'know', known: 'know',
  got: 'get', gotten: 'get',
  gave: 'give', given: 'give',
  found: 'find',
  thought: 'think',
  // bring / buy / catch / choose / drink / drive / eat / fall / feel / fight / fly
  brought: 'bring',
  bought: 'buy',
  caught: 'catch',
  chose: 'choose', chosen: 'choose',
  drank: 'drink', drunk: 'drink',
  drove: 'drive', driven: 'drive',
  ate: 'eat', eaten: 'eat',
  fell: 'fall', fallen: 'fall',
  felt: 'feel',
  fought: 'fight',
  flew: 'fly', flown: 'fly',
  // forget / forgive / freeze / grow / hear / hide / hit / hold / hurt / keep
  forgot: 'forget', forgotten: 'forget',
  forgave: 'forgive', forgiven: 'forgive',
  froze: 'freeze', frozen: 'freeze',
  grew: 'grow', grown: 'grow',
  heard: 'hear',
  hid: 'hide', hidden: 'hide',
  hit: 'hit',
  held: 'hold',
  hurt: 'hurt',
  kept: 'keep',
  // lay / lead / leave / lend / let / lie / lose / mean / meet / pay / put / read
  laid: 'lay',
  led: 'lead',
  left: 'leave',
  lent: 'lend',
  let: 'let',
  lay: 'lie', lain: 'lie',
  lost: 'lose',
  meant: 'mean',
  met: 'meet',
  paid: 'pay',
  put: 'put',
  read: 'read',
  // ride / ring / rise / run / say / sell / send / shake / shine / shoot / show
  rode: 'ride', ridden: 'ride',
  rang: 'ring', rung: 'ring',
  rose: 'rise', risen: 'rise',
  ran: 'run', run: 'run',
  sold: 'sell',
  sent: 'send',
  shook: 'shake', shaken: 'shake',
  shone: 'shine',
  shot: 'shoot',
  showed: 'show', shown: 'show',
  // sing / sink / sit / sleep / speak / spend / stand / steal / swim / swing
  sang: 'sing', sung: 'sing',
  sank: 'sink', sunk: 'sink',
  sat: 'sit',
  slept: 'sleep',
  spoke: 'speak', spoken: 'speak',
  spent: 'spend',
  stood: 'stand',
  stole: 'steal', stolen: 'steal',
  swam: 'swim', swum: 'swim',
  swung: 'swing',
  // teach / tear / tell / throw / understand / wake / wear / win / write
  taught: 'teach',
  tore: 'tear', torn: 'tear',
  told: 'tell',
  threw: 'throw', thrown: 'throw',
  understood: 'understand',
  woke: 'wake', woken: 'wake',
  wore: 'wear', worn: 'wear',
  won: 'win',
  wrote: 'write', written: 'write',
  // 其余常见不规则动词
  arose: 'arise', arisen: 'arise',
  awoke: 'awake', awoken: 'awake',
  bore: 'bear', borne: 'bear', born: 'bear',
  beat: 'beat', beaten: 'beat',
  became: 'become',
  began: 'begin', begun: 'begin',
  bent: 'bend',
  bet: 'bet',
  bound: 'bind',
  bit: 'bite', bitten: 'bite',
  bled: 'bleed',
  blew: 'blow', blown: 'blow',
  broke: 'break', broken: 'break',
  bred: 'breed',
  built: 'build',
  burnt: 'burn', burned: 'burn',
  burst: 'burst',
  cast: 'cast',
  clung: 'cling',
  crept: 'creep',
  cut: 'cut',
  dealt: 'deal',
  dug: 'dig',
  drew: 'draw', drawn: 'draw',
  dreamt: 'dream', dreamed: 'dream',
  fed: 'feed',
  fled: 'flee',
  flung: 'fling',
  forbade: 'forbid', forbidden: 'forbid',
  ground: 'grind',
  hung: 'hang', hanged: 'hang',
  leapt: 'leap', leaped: 'leap',
  learnt: 'learn', learned: 'learn',
  lit: 'light',
  mistook: 'mistake', mistaken: 'mistake',
  overcame: 'overcome',
  proved: 'prove', proven: 'prove',
  quit: 'quit',
  sought: 'seek',
  sewed: 'sew', sewn: 'sew',
  shed: 'shed',
  shut: 'shut',
  slid: 'slide',
  slit: 'slit',
  smelt: 'smell', smelled: 'smell',
  sowed: 'sow', sown: 'sow',
  sped: 'speed',
  spelt: 'spell', spelled: 'spell',
  spilt: 'spill', spilled: 'spill',
  spun: 'spin',
  spat: 'spit',
  split: 'split',
  spread: 'spread',
  sprang: 'spring', sprung: 'spring',
  stuck: 'stick',
  stung: 'sting',
  strode: 'stride',
  struck: 'strike', stricken: 'strike',
  strung: 'string',
  strove: 'strive', striven: 'strive',
  swore: 'swear', sworn: 'swear',
  swept: 'sweep',
  swelled: 'swell', swollen: 'swell',
  // 不规则名词
  children: 'child',
  men: 'man',
  women: 'woman',
  feet: 'foot',
  teeth: 'tooth',
  mice: 'mouse',
  geese: 'goose',
  people: 'person',
  lives: 'life',
  knives: 'knife',
  wives: 'wife',
  leaves: 'leaf',
  halves: 'half',
  // 不规则形容词 / 副词
  better: 'good',
  best: 'good',
  worse: 'bad',
  worst: 'bad',
  further: 'far',
  furthest: 'far',
  farther: 'far',
  farthest: 'far',
  less: 'little',
  least: 'little',
  more: 'much',
  most: 'much'
});

// 缩写拆分：didn't → do / not。用于词库比对。
const CONTRACTIONS = Object.freeze({
  "aren't": ['are', 'not'],
  "can't": ['can', 'not'],
  "couldn't": ['could', 'not'],
  "didn't": ['do', 'not'],
  "doesn't": ['does', 'not'],
  "don't": ['do', 'not'],
  "hadn't": ['had', 'not'],
  "hasn't": ['has', 'not'],
  "haven't": ['have', 'not'],
  "isn't": ['is', 'not'],
  "mustn't": ['must', 'not'],
  "needn't": ['need', 'not'],
  "shan't": ['shall', 'not'],
  "shouldn't": ['should', 'not'],
  "wasn't": ['was', 'not'],
  "weren't": ['were', 'not'],
  "won't": ['will', 'not'],
  "wouldn't": ['would', 'not'],
  "i'm": ['i', 'am'],
  "i've": ['i', 'have'],
  "i'll": ['i', 'will'],
  "i'd": ['i', 'would'],
  "you're": ['you', 'are'],
  "you've": ['you', 'have'],
  "you'll": ['you', 'will'],
  "you'd": ['you', 'would'],
  "he's": ['he', 'is'],
  "she's": ['she', 'is'],
  "it's": ['it', 'is'],
  "that's": ['that', 'is'],
  "there's": ['there', 'is'],
  "what's": ['what', 'is'],
  "who's": ['who', 'is'],
  "we're": ['we', 'are'],
  "we've": ['we', 'have'],
  "they're": ['they', 'are'],
  "they've": ['they', 'have'],
  "let's": ['let', 'us']
});

export function splitContraction(token) {
  const word = normalizeWord(token);
  if (!word) return [];
  const parts = CONTRACTIONS[word];
  if (parts) return parts;
  if (word.endsWith("n't")) return [word.slice(0, -3), 'not'];
  if (word.endsWith("'s")) return [word.slice(0, -2)];
  if (word.endsWith("'re")) return [word.slice(0, -3)];
  if (word.endsWith("'ve")) return [word.slice(0, -3)];
  if (word.endsWith("'ll")) return [word.slice(0, -3)];
  if (word.endsWith("'d")) return [word.slice(0, -2)];
  return [word];
}

// 名词复数、动词第三人称、形容词比较级等常见后缀。
const SUFFIX_RULES = [
  { suffix: 'ies', replacer: (stem) => `${stem}y` },
  { suffix: 'ied', replacer: (stem) => `${stem}y` },
  { suffix: 'ves', replacer: (stem) => `${stem}f` },
  { suffix: 'es', replacer: (stem) => stem },
  { suffix: 's', replacer: (stem) => stem },
  { suffix: 'ied', replacer: (stem) => `${stem}y` },
  { suffix: 'ing', replacer: (stem) => stem },
  { suffix: 'ed', replacer: (stem) => stem },
  { suffix: 'est', replacer: (stem) => stem },
  { suffix: 'er', replacer: (stem) => stem },
  { suffix: 'ly', replacer: (stem) => stem }
];

function undouble(stem) {
  // running -> runn -> run；stopped -> stopp -> stop
  const last = stem.slice(-1);
  const prev = stem.slice(-2, -1);
  if (stem.length > 2 && last === prev) return stem.slice(0, -1);
  return stem;
}

/**
 * 生成候选 lemma 列表，按可信度从高到低。
 * 调用方（lemmaOf）会逐个用 knownWords 验证。
 */
export function lemmaCandidates(word) {
  const normalized = normalizeWord(word);
  if (!normalized) return [];
  const seen = new Set();
  const out = [];

  const push = (value) => {
    const next = normalizeWord(value);
    if (!next || next === normalized || seen.has(next)) return;
    seen.add(next);
    out.push(next);
  };

  if (IRREGULAR[normalized]) push(IRREGULAR[normalized]);

  for (const { suffix, replacer } of SUFFIX_RULES) {
    if (!normalized.endsWith(suffix)) continue;
    const stem = normalized.slice(0, -suffix.length);
    if (stem.length < 2) continue;
    push(replacer(stem));
    // 双写辅音：running -> runn -> run
    push(undouble(stem));
    // 词尾 e 脱落：making -> mak -> make；hoped -> hop -> hope
    push(`${stem}e`);
    // 变 y 为 i：studies -> studi -> study
    push(replacer(stem).replace(/i$/, 'y'));
    // -ies / -ied 已在上方处理
  }

  // 连字符词：well-known -> well-known 与 known 都保留
  if (normalized.includes('-')) {
    for (const part of normalized.split('-')) push(part);
  }

  return out;
}

/**
 * 取 lemma。
 * - 有 knownWords 时：只采纳在已知词表里出现的候选
 * - 无 knownWords 时：只信任不规则表，其余保留原形（保守策略）
 */
export function lemmaOf(word, { knownWords = null } = {}) {
  const normalized = normalizeWord(word);
  if (!normalized) return '';
  const irregular = IRREGULAR[normalized];
  const candidates = lemmaCandidates(normalized);

  if (knownWords && typeof knownWords.has === 'function') {
    for (const candidate of candidates) {
      if (knownWords.has(candidate)) return candidate;
    }
    if (knownWords.has(normalized)) return normalized;
    return normalized;
  }

  return irregular || normalized;
}

/** 判断一个 token 是否像专有名词（不在句首的大写词、缩写点号词） */
export function looksLikeProperNoun(token, { sentenceStart = false } = {}) {
  const raw = String(token ?? '');
  if (!raw) return false;
  // 全大写缩写：U.S / US / CEO
  if (/^[A-Z][A-Z.]{1,}$/.test(raw)) return true;
  // 带点号：e.g / i.e / Inc.
  if (/^[A-Za-z](\.[A-Za-z])+\.?$/.test(raw)) return true;
  if (sentenceStart) return false;
  return /^[A-Z]/.test(raw);
}
