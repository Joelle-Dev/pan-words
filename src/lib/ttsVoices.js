// 系统 TTS 的语音列表。
// getVoices() 在部分浏览器是异步填充的（首次返回空数组），所以要等 voiceschanged。

let cached = [];

function readVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  try {
    return window.speechSynthesis.getVoices() || [];
  } catch (err) {
    return [];
  }
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  cached = readVoices();
  if (!cached.length) {
    window.speechSynthesis.addEventListener?.('voiceschanged', () => {
      cached = readVoices();
    });
  }
}

export function allVoices() {
  const fresh = readVoices();
  if (fresh.length) cached = fresh;
  return cached;
}

export function getVoicesFor(langPrefix = 'en') {
  const prefix = String(langPrefix).toLowerCase();
  return allVoices().filter((voice) => String(voice.lang || '').toLowerCase().startsWith(prefix));
}
