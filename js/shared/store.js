/* =========================================
   CEO플래너 — 데이터 저장소 (비서 웹 · CEO 앱 공용)
   - 데모 모드: 이 브라우저 localStorage 에 저장.
     같은 브라우저의 다른 탭(비서 웹 ↔ CEO 앱)에도 바로 반영됩니다.
   - Supabase 모드: config.js 에 주소·키가 있으면 서버에 저장하고 실시간 동기화.
   화면 코드는 모드와 상관없이 Store.* 만 사용합니다.
   ========================================= */
const Store = {
  KEY: 'CEOP_DATA_V1',
  role: 'ceo',          // 'ceo' | 'secretary'
  mode: 'demo',         // 'demo' | 'supabase'
  data: null,
  client: null,
  user: null,
  ceoId: null,
  needsLogin: false,
  _subs: [],

  async init(role) {
    this.role = role;
    const cfg = window.CEOP_CONFIG || {};
    if (cfg.SUPABASE_URL && cfg.SUPABASE_KEY && window.supabase) {
      this.mode = 'supabase';
      this.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
      const { data } = await this.client.auth.getSession();
      if (!data.session) { this.needsLogin = true; this.data = this._empty(); return; }
      await this._afterLogin(data.session.user);
    } else {
      this.mode = 'demo';
      this._loadDemo();
      window.addEventListener('storage', e => { if (e.key === this.KEY) { this._loadDemo(); this._emit(); } });
    }
  },

  _empty() { return { profile: {}, schedules: [], messages: [] }; },

  // ───────── 구독 (데이터가 바뀌면 화면 다시 그리기) ─────────
  on(fn) { this._subs.push(fn); },
  _emit() { this._subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },

  // ───────── 읽기 ─────────
  profile() { return this.data.profile || {}; },
  /** 비서에게는 CEO 개인 일정을 '바쁨'으로 가려서 돌려줍니다. */
  _view(s) {
    if (this.role === 'secretary' && s.visibility === 'private') {
      return { id: s.id, date: s.date, start: s.start, end: s.end, title: '바쁨', category: 'personal', mode: 'none', visibility: 'private', masked: true, briefing: {} };
    }
    return s;
  },
  list() { return this.data.schedules.map(s => this._view(s)); },
  byDate(ymd) { return this.list().filter(s => s.date === ymd).sort((a, b) => a.start.localeCompare(b.start)); },
  get(id) { const s = this.data.schedules.find(x => x.id === id); return s ? this._view(s) : null; },
  messages() { return [...this.data.messages].sort((a, b) => a.at.localeCompare(b.at)); },

  // ───────── 쓰기 ─────────
  async upsert(s) {
    if (!s.id) s.id = U.uid();
    if (!s.createdBy) s.createdBy = this.role;
    // 비서가 수정하면 CEO 확인을 다시 받음
    if (this.role === 'secretary') s.ackAt = null;
    if (this.mode === 'supabase') {
      const { error } = await this.client.from('schedules').upsert(this._toRow(s));
      if (error) throw error;
      await this._reload();
    } else {
      const i = this.data.schedules.findIndex(x => x.id === s.id);
      if (i >= 0) this.data.schedules[i] = { ...this.data.schedules[i], ...s }; else this.data.schedules.push(s);
      this._saveDemo();
    }
    return s;
  },

  async remove(id) {
    if (this.mode === 'supabase') {
      const { error } = await this.client.from('schedules').delete().eq('id', id);
      if (error) throw error;
      await this._reload();
    } else {
      this.data.schedules = this.data.schedules.filter(s => s.id !== id);
      this._saveDemo();
    }
  },

  /** CEO가 일정을 확인함 */
  async ack(id) {
    const at = new Date().toISOString();
    if (this.mode === 'supabase') {
      const { error } = await this.client.from('schedules').update({ ack_at: at }).eq('id', id);
      if (error) throw error;
      await this._reload();
    } else {
      const s = this.data.schedules.find(x => x.id === id);
      if (s) { s.ackAt = at; this._saveDemo(); }
    }
  },

  async send(body, { urgent = false } = {}) {
    const msg = { id: U.uid(), from: this.role, body: String(body).slice(0, 1000), urgent, at: new Date().toISOString() };
    if (this.mode === 'supabase') {
      const { error } = await this.client.from('messages').insert({ ceo_id: this.ceoId, sender_id: this.user.id, sender_role: this.role, body: msg.body, urgent });
      if (error) throw error;
      await this._reload();
    } else {
      this.data.messages.push(msg);
      this._saveDemo();
    }
  },

  async saveProfile(patch) {
    this.data.profile = { ...this.data.profile, ...patch };
    if (this.mode === 'supabase') {
      const { error } = await this.client.from('profiles').update({ settings: this.data.profile }).eq('id', this.ceoId);
      if (error) throw error;
    } else this._saveDemo();
  },

  resetDemo() { localStorage.removeItem(this.KEY); this._loadDemo(); this._emit(); },

  // ───────── 데모 모드 ─────────
  _loadDemo() {
    try { this.data = JSON.parse(localStorage.getItem(this.KEY)); } catch { this.data = null; }
    if (!this.data || !Array.isArray(this.data.schedules)) {
      this.data = Demo.build();
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    }
  },
  _saveDemo() { localStorage.setItem(this.KEY, JSON.stringify(this.data)); this._emit(); },

  // ───────── Supabase 모드 ─────────
  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.needsLogin = false;
    await this._afterLogin(data.user);
    this._emit();
  },
  async signOut() { if (this.client) await this.client.auth.signOut(); location.reload(); },

  async _afterLogin(user) {
    this.user = user;
    if (this.role === 'ceo') this.ceoId = user.id;
    else {
      const { data, error } = await this.client.from('ceo_secretaries').select('ceo_id').eq('secretary_id', user.id).limit(1);
      if (error) throw error;
      this.ceoId = data && data[0] ? data[0].ceo_id : null;
    }
    await this._reload();
    this.client.channel('ceop-' + this.ceoId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules', filter: `ceo_id=eq.${this.ceoId}` }, () => this._reload().then(() => this._emit()))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `ceo_id=eq.${this.ceoId}` }, () => this._reload().then(() => this._emit()))
      .subscribe();
  },

  async _reload() {
    if (!this.ceoId) { this.data = this._empty(); return; }
    // schedule_feed 뷰: 비서에게는 개인 일정을 서버에서 '바쁨'으로 가려서 내려줌
    const [sch, msg, prof] = await Promise.all([
      this.client.from('schedule_feed').select('*').eq('ceo_id', this.ceoId),
      this.client.from('messages').select('*').eq('ceo_id', this.ceoId).order('created_at', { ascending: true }).limit(300),
      this.client.from('profiles').select('name, settings').eq('id', this.ceoId).single(),
    ]);
    if (sch.error) throw sch.error;
    if (msg.error) throw msg.error;
    this.data = {
      profile: { name: prof.data?.name, ...(prof.data?.settings || {}) },
      schedules: (sch.data || []).map(r => this._fromRow(r)),
      messages: (msg.data || []).map(r => ({ id: r.id, from: r.sender_role, body: r.body, urgent: r.urgent, at: r.created_at })),
    };
  },

  _toRow(s) {
    return {
      id: s.id, ceo_id: this.ceoId, title: s.title, category: s.category, date: s.date,
      start_time: s.start, end_time: s.end || s.start, location: s.location || null,
      mode: s.mode || 'none', travel_min: s.travelMin || 0, buffer_min: s.bufferMin ?? 10,
      visibility: s.visibility || 'normal', trip: s.trip || null, briefing: s.briefing || {},
      status: s.status || 'scheduled', ack_at: s.ackAt || null, created_role: s.createdBy || this.role,
    };
  },
  _fromRow(r) {
    return {
      id: r.id, title: r.title, category: r.category, date: r.date,
      start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5),
      location: r.location || '', mode: r.mode, travelMin: r.travel_min, bufferMin: r.buffer_min,
      visibility: r.visibility, trip: r.trip, briefing: r.briefing || {}, status: r.status,
      ackAt: r.ack_at, createdBy: r.created_role, masked: !!r.masked,
    };
  },
};
