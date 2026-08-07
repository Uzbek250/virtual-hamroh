// AudioWorklet processor Gemini Live API'dan kelgan PCM16 audio
// bo'laklarini (24kHz) navbatga qo'yadi va ularni AudioContext'ning
// haqiqiy (brauzer/qurilma standart) sample rate'iga moslab, uzluksiz,
// tutilishsiz pleyback qiladi. Asosiy oqimdan "push" xabari orqali yangi
// bo'lak keladi, "clear" xabari orqali esa navbat tozalanadi
// (foydalanuvchi gapira boshlab, Mimi'ning javobini kesib o'tganda
// ishlatiladi).
//
// AudioContext aniq 24000 sampleRate bilan yaratilmaydi (ba'zi
// brauzerlarda buni to'g'ri qo'llab-quvvatlamaydi), shuning uchun
// qayta namunalash shu yerda amalga oshiriladi.
const SOURCE_SAMPLE_RATE = 24000;

class PlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._queue = [];
    this._offset = 0;
    // sampleRate — AudioWorkletGlobalScope'ning global o'zgaruvchisi.
    this._ratio = SOURCE_SAMPLE_RATE / sampleRate;
    this.port.onmessage = (event) => {
      if (event.data.type === "push") {
        // event.data.samples — Float32Array, 24kHz, [-1, 1] oralig'ida.
        this._queue.push(this._resample(event.data.samples));
      } else if (event.data.type === "clear") {
        this._queue = [];
        this._offset = 0;
      }
    };
  }

  _resample(samples) {
    if (this._ratio === 1) return samples;
    const outLength = Math.floor(samples.length / this._ratio);
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const srcIndex = i * this._ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const frac = srcIndex - srcIndexFloor;
      const s0 = samples[srcIndexFloor] || 0;
      const s1 = samples[srcIndexFloor + 1] || s0;
      out[i] = s0 + (s1 - s0) * frac;
    }
    return out;
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    let writeIndex = 0;

    while (writeIndex < output.length) {
      if (this._queue.length === 0) {
        // Navbat bo'sh — sukunat (silence) yozamiz.
        output[writeIndex++] = 0;
        continue;
      }
      const current = this._queue[0];
      output[writeIndex++] = current[this._offset++];
      if (this._offset >= current.length) {
        this._queue.shift();
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("player-processor", PlayerProcessor);
