/* =========================================
   고음질 음성 받아쓰기 (4개 플래너 공용 · 같은 파일)
   - 마이크로 녹음 → 서버(voice-stt)가 OpenAI 음성 인식으로 글자로 바꿈
   - 말이 끝나면(1.8초 조용) 자동으로 멈춤 · 8초 동안 말이 없으면 취소 · 최대 30초
   - 서버가 꺼졌거나 한도를 넘으면 onFail → 각 앱은 기기 받아쓰기로 바꿔 씀
   쓰는 법: ServerVoice.start({ url, anon, token: async () => '...', app: 'buddy', hints: [], onState, onText, onFail })
   ========================================= */
(function () {
  const OFF_KEY = 'sv_off_day';
  const ServerVoice = {
    MAX_SEC: 30,
    SILENCE_MS: 1800,
    _probe: null,
    _cur: null,

    supported() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    },
    _offToday() { try { return localStorage.getItem(OFF_KEY) === new Date().toDateString(); } catch (e) { return false; } },
    _setOffToday() { try { localStorage.setItem(OFF_KEY, new Date().toDateString()); } catch (e) { } },
    active() { return !!this._cur; },

    /** 서버 받아쓰기를 쓸 수 있나 (녹음 지원 + 로그인 토큰 + 서버 켜짐 + 오늘 한도 안 넘음). 앱 실행마다 한 번만 확인 */
    async ready(o) {
      if (!this.supported() || this._offToday() || !o || !o.url) return false;
      let token = '';
      try { token = await o.token(); } catch (e) { return false; }
      if (!token) return false;
      if (!this._probe) {
        this._probe = (async () => {
          try {
            const r = await fetch(`${o.url.replace(/\/+$/, '')}/functions/v1/voice-stt`, {
              method: 'POST', headers: { apikey: o.anon || '', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}'
            });
            // 401 = 이 서버가 받아 주지 않는 로그인(다른 서버의 표·만료) → 녹음하기 전에 기기 받아쓰기로
            return r.status !== 503 && r.status !== 404 && r.status !== 401;
          } catch (e) { return false; }
        })();
      }
      return await this._probe;
    },

    stop() { if (this._cur) this._cur.stop('tap'); },
    cancel() { if (this._cur) this._cur.stop('cancel'); },

    /** 녹음 시작. onState('listening'|'busy'|'idle'), onText(글자), onFail(이유, 안내문) */
    async start(o) {
      if (this._cur) { this.stop(); return; }
      const st = s => { try { o.onState && o.onState(s); } catch (e) { } };
      const fail = (why, msg) => { st('idle'); try { o.onFail && o.onFail(why, msg); } catch (e) { } };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e) { return fail('mic_denied', '마이크 권한을 허용해 주세요. (설정에서 이 앱의 마이크를 켜 주세요)'); }
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
      let rec;
      try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
      catch (e) { stream.getTracks().forEach(t => t.stop()); return fail('no_recorder'); }

      const chunks = [], t0 = Date.now();
      let heard = false, lastLoud = Date.now(), ctx = null, tick = null, guard = null, why = '';
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const cleanup = () => { clearInterval(tick); clearTimeout(guard); try { ctx && ctx.close(); } catch (e) { } stream.getTracks().forEach(t => t.stop()); };
      const stop = reason => {
        if (why) return; why = reason;
        try { if (rec.state !== 'inactive') rec.stop(); else rec.onstop(); } catch (e) { cleanup(); this._cur = null; st('idle'); }
      };
      // 말 끝 감지 (소리 크기로)
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        const an = ctx.createAnalyser(); an.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        tick = setInterval(() => {
          an.getByteTimeDomainData(buf);
          let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
          if (Math.sqrt(sum / buf.length) > 0.035) { heard = true; lastLoud = Date.now(); }
          const el = Date.now() - t0;
          if (heard && Date.now() - lastLoud > this.SILENCE_MS) stop('silence');
          else if (!heard && el > 8000) stop('nothing');
        }, 120);
      } catch (e) { heard = true; }
      guard = setTimeout(() => stop('max'), this.MAX_SEC * 1000);

      rec.onstop = async () => {
        cleanup();
        this._cur = null;
        const sec = (Date.now() - t0) / 1000;
        if (why === 'cancel') return st('idle');
        if (why === 'nothing' || !heard || sec < 0.6) return fail('no_speech', '말소리가 들리지 않았어요. 다시 눌러 말씀해 주세요.');
        st('busy');
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/mp4' });
        try {
          const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(blob); });
          const token = await o.token();
          const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const to = ctl ? setTimeout(() => ctl.abort(), 25000) : null;
          const r = await fetch(`${o.url.replace(/\/+$/, '')}/functions/v1/voice-stt`, {
            method: 'POST', signal: ctl ? ctl.signal : undefined,
            headers: { apikey: o.anon || '', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: b64, mime: blob.type, seconds: Math.ceil(sec), app: o.app || '', hints: (o.hints || []).slice(0, 25) })
          });
          if (to) clearTimeout(to);
          const d = await r.json().catch(() => ({}));
          if (r.ok && typeof d.text === 'string') {
            st('idle');
            if (!d.text) return fail('empty', '잘 듣지 못했어요. 다시 말씀해 주세요.');
            try { o.onText && o.onText(d.text); } catch (e) { }
            return;
          }
          if (d.error === 'daily_limit' || d.error === 'monthly_cap') this._setOffToday();
          else this._probe = Promise.resolve(false);   // 이번 실행 동안은 기기 받아쓰기
          return fail(d.error || 'server', d.message || '고음질 받아쓰기를 지금 쓸 수 없어요. 마이크를 다시 누르면 기본 받아쓰기로 들어요.');
        } catch (e) {
          return fail('network', navigator.onLine === false ? '인터넷 연결을 확인해 주세요.' : '받아쓰기가 늦어지고 있어요. 다시 말씀해 주세요.');
        }
      };
      this._cur = { stop };
      st('listening');
      try { rec.start(250); } catch (e) { cleanup(); this._cur = null; fail('no_recorder'); }
    }
  };
  window.ServerVoice = ServerVoice;
})();
