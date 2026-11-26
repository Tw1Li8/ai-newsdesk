// 정적 사이트용 어댑터: 서버(/api/...) 대신 미리 만들어 둔 data.json / digests.json 으로 같은 응답을 만들어 줍니다.
// app.js 는 window.__staticApi 가 있으면 fetch 대신 이것을 호출합니다. 스터디 보드는 이 브라우저의 localStorage 에 저장됩니다.
(() => {
  // 열어 둔 탭도 새 빌드를 받도록 TTL 이 지나면 다시 받습니다(화면 자동 갱신 5분보다 짧게). 실패하면 직전 데이터를 씁니다.
  const TTL = 4 * 60e3;
  const cached = (url) => {
    let p, at = 0, last;
    return () => {
      if (p && Date.now() - at < TTL) return p;
      at = Date.now();
      return (p = fetch(url, { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); })
        .then((v) => (last = v))
        .catch((e) => { at = 0; if (last) return last; p = null; throw e; }));
    };
  };
  const data = cached('data.json');
  const digestFile = cached('digests.json');
  const digs = () => digestFile().catch(() => ({}));
  const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const ROWS = 'nd-study', FAV = 'nd-fav';

  async function items(q) {
    const d = await data();
    const cat = q.get('cat') || 'all', lang = q.get('lang') || 'all', text = (q.get('q') || '').toLowerCase().trim(), topic = q.get('topic') || '';
    const sort = q.get('sort') || 'rank', days = +q.get('days') || 0, limit = Math.min(+q.get('limit') || 300, 1000);
    const cutoff = days ? Date.now() - days * 864e5 : 0;
    const base = d.items.filter((i) => (lang === 'all' || i.lang === lang) && i.published >= cutoff && !i.dupOf
      && (!text || (i.title + ' ' + (i.summary || '') + ' ' + (i.titleKo || '') + ' ' + (i.summaryKo || '') + ' ' + i.source).toLowerCase().includes(text)));
    const list = base.filter((i) => (cat === 'all' || i.cat === cat) && (topic !== 'eng' || i.eng));
    list.sort(sort === 'new' ? (a, b) => b.published - a.published : (a, b) => b.rank - a.rank);
    const counts = {}; for (const i of base) counts[i.cat] = (counts[i.cat] || 0) + 1;
    counts.eng = base.filter((i) => i.eng).length;
    return { total: list.length, counts, all: base.length, updatedAt: d.updatedAt, items: list.slice(0, limit) };
  }

  async function digest(id) {
    const [d, g] = await Promise.all([data(), digs()]);
    if (g[id]) return g[id];
    const fv = ls.get(FAV, {})[id];
    if (fv && fv.digest) return fv.digest; // 찜할 때 저장해 둔 요약
    const it = d.items.find((x) => x.id === id) || (ls.get(ROWS, {})[id] || {}).item || (fv && fv.item);
    if (!it) return { points: [], pointsOrig: [], translated: false, note: '항목을 찾을 수 없습니다.' };
    const text = it.summaryKo || it.summary || '';
    return { points: text ? [text] : [], pointsOrig: [], translated: !!it.summaryKo, from: 'feed', image: '',
      note: '이 기사는 핵심 요약을 미리 만들어 두지 않았습니다(상위 기사만 준비). 아래 원문 링크에서 전체를 확인하세요.', related: [] };
  }

  async function study(method, path, body) {
    const rows = ls.get(ROWS, {});
    if (method === 'GET') return { study: Object.values(rows).sort((a, b) => b.addedAt - a.addedAt) };
    if (method === 'DELETE') { delete rows[decodeURIComponent(path.slice(11))]; ls.set(ROWS, rows); return { ok: true }; }
    const id = String(body.id || ''); let cur = rows[id];
    if (!cur) {
      const it = (await data()).items.find((x) => x.id === id); if (!it) return { error: '항목 없음' };
      cur = { id, item: it, addedAt: Date.now(), status: 'todo', note: '', tags: [] };
    }
    if (['todo', 'doing', 'done'].includes(body.status)) cur.status = body.status;
    if (typeof body.note === 'string') cur.note = body.note.slice(0, 5000);
    if (Array.isArray(body.tags)) cur.tags = body.tags.map((t) => String(t).slice(0, 24)).slice(0, 10);
    rows[id] = cur; ls.set(ROWS, rows); return { ok: true, entry: cur };
  }

  async function fav(method, path, body) {
    const rows = ls.get(FAV, {});
    if (method === 'GET') return { fav: Object.values(rows).sort((a, b) => b.savedAt - a.savedAt).map(({ id, savedAt, item }) => ({ id, savedAt, item })) };
    if (method === 'DELETE') { delete rows[decodeURIComponent(path.slice(9))]; ls.set(FAV, rows); return { ok: true }; }
    if (path === '/api/fav/import') {
      let n = 0;
      for (const e of (Array.isArray(body.fav) ? body.fav : []).slice(0, 5000)) {
        if (!e || typeof e.id !== 'string' || !e.item || typeof e.item.url !== 'string' || rows[e.id]) continue;
        rows[e.id] = { id: e.id, savedAt: +e.savedAt || Date.now(), item: e.item, digest: e.digest || null }; n++;
      }
      ls.set(FAV, rows); return { ok: true, added: n };
    }
    const id = String(body.id || ''); if (!id) return { error: 'id 필요' };
    if (!rows[id]) {
      const [d, g] = await Promise.all([data(), digs()]);
      const it = d.items.find((x) => x.id === id); if (!it) return { error: '항목 없음' };
      rows[id] = { id, savedAt: Date.now(), item: it, digest: g[id] || null };
    }
    ls.set(FAV, rows); const { savedAt, item } = rows[id]; return { ok: true, entry: { id, savedAt, item } };
  }

  window.__staticApi = async (p, opt = {}) => {
    const method = (opt.method || 'GET').toUpperCase();
    const u = new URL(p, 'http://x');
    if (u.pathname === '/api/items') return items(u.searchParams);
    if (u.pathname === '/api/digest') return digest(u.searchParams.get('id') || '');
    if (u.pathname === '/api/status') { const d = await data(); return { running: false, updatedAt: d.updatedAt, results: [], added: 0 }; }
    if (u.pathname === '/api/fav' || u.pathname.startsWith('/api/fav/')) return fav(method, u.pathname, opt.body ? JSON.parse(opt.body) : {});
    if (u.pathname === '/api/study' || u.pathname.startsWith('/api/study/')) return study(method, u.pathname, opt.body ? JSON.parse(opt.body) : {});
    return { error: '정적 사이트에서는 지원하지 않는 기능입니다' };
  };
  window.__staticSite = true;
})();
