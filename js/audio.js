/* 효과음 재생 담당.
   file:// 로 열어도 동작하도록 Web Audio 대신 <audio> 요소를 씁니다. */
'use strict';

const Sound = {
  _pool: {},     // 이름 -> HTMLAudioElement 원본
  _on: true,
  _master: 1,

  init() {
    this._on = CONFIG.sound.on;
    this._master = CONFIG.sound.masterVolume;
    for (const name in CONFIG.sound.clips) {
      const [file, vol] = CONFIG.sound.clips[name];
      const a = new Audio(asset('assets/sounds/' + file));
      a.preload = 'auto';
      a.volume = clamp(vol * this._master, 0, 1);
      a._baseVol = vol;
      this._pool[name] = a;
    }
  },

  setOn(v)      { this._on = !!v; },
  setMaster(v)  {
    this._master = clamp(v, 0, 1);
    for (const k in this._pool) {
      this._pool[k].volume = clamp(this._pool[k]._baseVol * this._master, 0, 1);
    }
  },

  /** 소리 재생. rate 를 주면 재생 속도(음높이)가 달라집니다. */
  play(name, rate) {
    if (!this._on) return;
    const src = this._pool[name];
    if (!src) return;
    // 겹쳐 나도 끊기지 않도록 복제해서 재생
    const a = src.cloneNode();
    a.volume = src.volume;
    if (rate) a.playbackRate = rate;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});   // 자동재생 차단은 조용히 무시
  },

  stopAll() {
    // cloneNode 로 재생한 것들은 스스로 사라지므로 특별히 할 일이 없습니다.
  },
};
