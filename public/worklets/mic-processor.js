// AudioWorklet processor mikrofondan kelayotgan audio bo'laklarini
// (brauzer/qurilma tanlagan istalgan sample rate — odatda 44.1kHz yoki
// 48kHz, Float32) qabul qiladi va ularni Gemini Live API kutayotgan
// formatga — 16kHz, 16-bit signed PCM — o'tkazadi.
//
// AudioContext'ni aniq 16000 sampleRate bilan yaratish ba'zi brauzerlarda
// (masalan Firefox) noto'g'ri ishlaydi va getUserMedia oqimi bilan
// nomuvofiqlik xatosiga olib kelishi mumkin, shuning uchun bu yerda
// AudioContext o'zining standart sample rate'ida ishlaydi, konvertatsiya
// esa shu worklet ichida qo'lda (chiziqli interpolyatsiya bilan) amalga
// oshiriladi — bu barcha brauzerlarda barqaror ishlaydi.
const TARGET_SAMPLE_RATE = 16000;

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // sampleRate — AudioWorkletGlobalScope'ning global o'zgaruvchisi,
    // joriy AudioContext'ning haqiqiy sample rate'ini beradi.
    this._ratio = sampleRate / TARGET_SAMPLE_RATE;
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      const outLength = Math.floor(channelData.length / this._ratio);
      const pcm16 = new Int16Array(outLength);
      for (let i = 0; i < outLength; i++) {
        // Chiziqli interpolyatsiya bilan qayta namunalash (resample).
        const srcIndex = i * this._ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const frac = srcIndex - srcIndexFloor;
        const s0 = channelData[srcIndexFloor] || 0;
        const s1 = channelData[srcIndexFloor + 1] || s0;
        const sample = s0 + (s1 - s0) * frac;
        const clamped = Math.max(-1, Math.min(1, sample));
        pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);
