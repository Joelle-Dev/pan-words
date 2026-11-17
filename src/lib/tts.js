import { getVoicesFor } from './ttsVoices.js';

// 系统 TTS 封装。
// iOS 上首次播放必须发生在用户手势里，否则静音；
// 语音包可能未下载，需要能优雅降级。

export function supportsSpeech() {
  return typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance === 'function';
}

let primed = false;

/** 在第一次用户点击时调用一次，激活 iOS 的音频通道 */
export function primeSpeech() {
  if (primed || !supportsSpeech()) return;
  primed = true;
  try {
    const utterance = new window.SpeechSynthesisUtterance(' ');
    utterance.volume = 0;
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    // 忽略：不能发音也不影响复习
  }
}

export function hasEnglishVoice() {
  if (!supportsSpeech()) return false;
  return getVoicesFor('en').length > 0;
}

export function speak(text, { lang = 'en-US', rate = 0.9 } = {}) {
  if (!supportsSpeech()) return false;
  const value = String(text || '').trim();
  if (!value) return false;

  try {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(value);
    utterance.lang = lang;
    utterance.rate = rate;
    const voices = getVoicesFor(lang.slice(0, 2));
    if (voices.length) utterance.voice = voices[0];
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    return false;
  }
}

export function stopSpeaking() {
  if (!supportsSpeech()) return;
  try {
    window.speechSynthesis.cancel();
  } catch (err) {
    // 忽略
  }
}
