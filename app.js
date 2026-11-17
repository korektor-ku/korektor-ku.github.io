'use strict';
/* ===== Util & State ===== */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const LSg = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } };
const LSs = (k, v) => localStorage.setItem(k, JSON.stringify(v));
/* >>> PASTE URL WEB APP (hasil deploy Apps Script, berakhiran /exec) DI SINI <<< */
const GAS_URL = 'PASTE_URL_WEB_APP_DI_SINI';
const HAS_URL = /^https:\/\/script\.google\.com\/.+\/exec$/.test(GAS_URL.trim());
const DEF = { empty: 15, vmin: 18, vmax: 48, cancel: 50, pad: 15, padBS: 6, C: 16 };
const S = {
  url: HAS_URL ? GAS_URL.trim() : LSg('ljk_url', ''), siswa: LSg('ljk_siswa', []), kunci: LSg('ljk_kunci', []), hasil: LSg('ljk_hasil', []),
  cfg: { ...DEF, ...LSg('ljk_cfg', {}) }, exam: LSg('ljk_exam', ''), cv: false, stream: null, cur: null, man: null
};
const save = () => { LSs('ljk_siswa', S.siswa); LSs('ljk_kunci', S.kunci); LSs('ljk_hasil', S.hasil); LSs('ljk_cfg', S.cfg); LSs('ljk_url', S.url); LSs('ljk_exam', S.exam) };
const icons = () => window.lucide && lucide.createIcons();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const exams = () => [...new Set(S.kunci.map(k => k.ID_Ujian))];

function toast(msg, t = 'ok') {
  const c = { ok: 'bg-emerald-600', warn: 'bg-amber-500', err: 'bg-rose-600', info: 'bg-slate-800' }[t];
  const d = document.createElement('div');
  d.className = `${c} text-white text-sm font-semibold px-4 py-3 rounded-2xl shadow-lg transition-all duration-300 opacity-0 -translate-y-2`;
  d.textContent = msg; $('#toasts').append(d);
  requestAnimationFrame(() => d.classList.remove('opacity-0', '-translate-y-2'));
  setTimeout(() => { d.classList.add('opacity-0'); setTimeout(() => d.remove(), 300) }, 3000);
}
function status() {
  const set = (id, cls, txt) => { const e = $(id); e.className = 'pill ' + cls; e.querySelector('span').textContent = txt };
  set('#pCv', S.cv ? 'ok' : 'wait', S.cv ? 'OpenCV siap' : 'Memuat OpenCV');
  set('#pNet', navigator.onLine ? 'ok' : 'off', navigator.onLine ? 'Online' : 'Offline');
  const n = S.hasil.filter(h => !h.synced).length; set('#pQ', n ? 'warn' : 'ok', n + ' antre');
}

/* ===== Navigasi ===== */
function tab(n) {
  $$('[data-sec]').forEach(s => s.classList.toggle('hidden', s.dataset.sec !== n));
  $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === n));
  n === 'scan' ? startCam() : stopCam();
  if (n === 'kunci') renderKunci(); if (n === 'rekap') renderRekap(); if (n === 'set') renderSet();
  icons();
}
$$('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));

/* ===== Kamera & Upload ===== */
async function startCam() {
  if (S.stream) return;
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    $('#vid').srcObject = S.stream;
  } catch (e) { toast('Kamera tidak dapat diakses. Gunakan tombol unggah foto.', 'warn') }
}
function stopCam() { S.stream && S.stream.getTracks().forEach(t => t.stop()); S.stream = null }
$('#btnCap').onclick = () => {
  const v = $('#vid'); if (!v.videoWidth) return toast('Kamera belum siap', 'warn');
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0); run(c);
};
$('#file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const im = new Image();
  im.onload = () => {
    const s = Math.min(1, 1800 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    URL.revokeObjectURL(im.src); run(c);
  };
  im.src = URL.createObjectURL(f); e.target.value = '';
};

/* ===== Mesin OMR ===== */
const TW = 300, TH = 660, BW = 300, BH = 360;   // ukuran hasil warp (tabel PG: 11 baris x 60px; B/S: 6 baris x 60px)
function run(src) {
  if (!S.cv) return toast('OpenCV masih dimuat, tunggu sebentar…', 'warn');
  $('#busy').classList.remove('hidden');
  setTimeout(() => {
    try {
      const q = detect(src);
      if (q) finish(src, q); else { toast('Kelima tabel tidak terdeteksi — atur sudut manual', 'warn'); manual(src) }
    } catch (e) { console.error(e); toast('Gagal memproses: ' + e.message, 'err') }
    $('#busy').classList.add('hidden');
  }, 60);
}
const order = p => {
  const s = p.map(q => q[0] + q[1]), d = p.map(q => q[1] - q[0]);
  return [p[s.indexOf(Math.min(...s))], p[d.indexOf(Math.min(...d))], p[s.indexOf(Math.max(...s))], p[d.indexOf(Math.max(...d))]];
};
function detect(src) {
  const m = cv.imread(src), g = new cv.Mat(), b = new cv.Mat(), t = new cv.Mat(), k = cv.Mat.ones(3, 3, cv.CV_8U), cs = new cv.MatVector(), h = new cv.Mat();
  cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(g, b, new cv.Size(5, 5), 0);
  cv.adaptiveThreshold(b, t, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, S.cfg.C);
  cv.dilate(t, t, k);
  cv.findContours(t, cs, h, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  const W = g.cols, H = g.rows, minA = W * H * 0.012, maxA = W * H * 0.25, L = [];
  for (let i = 0; i < cs.size(); i++) {
    const c = cs.get(i), a = cv.contourArea(c);
    if (a > minA && a < maxA) {
      const ap = new cv.Mat(); cv.approxPolyDP(c, ap, 0.02 * cv.arcLength(c, true), true);
      if (ap.rows === 4 && cv.isContourConvex(ap)) {
        const p = []; for (let j = 0; j < 4; j++) p.push([ap.data32S[j * 2], ap.data32S[j * 2 + 1]]);
        const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
        L.push({ p: order(p), a, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 });
      }
      ap.delete();
    }
    c.delete();
  }
  [m, g, b, t, k, cs, h].forEach(x => x.delete());
  L.sort((x, y) => y.a - x.a);
  const K = []; // buang kontur ganda (tepi luar & dalam garis tabel)
  L.forEach(o => { if (!K.some(q => Math.hypot(q.cx - o.cx, q.cy - o.cy) < 0.3 * Math.min(q.w, o.w))) K.push(o) });
  const tall = K.filter(o => o.h / o.w > 1.6 && o.h / o.w < 2.8).slice(0, 4).sort((x, y) => x.cx - y.cx);
  const bs = K.filter(o => o.h / o.w > 0.55 && o.h / o.w < 1.3 && o.cy > H * 0.55).sort((x, y) => y.cy - x.cy)[0];
  return tall.length === 4 && bs ? [...tall.map(o => o.p), bs.p] : null;
}
function finish(src, quads) {
  const m = cv.imread(src), g = new cv.Mat(); cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY); m.delete();
  const ans = {}, bases = [];
  quads.forEach((q, t) => {
    const bs = t === 4, w = bs ? BW : TW, h = bs ? BH : TH;
    const f = cv.matFromArray(4, 1, cv.CV_32FC2, q.flat()), d = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
    const M = cv.getPerspectiveTransform(f, d), o = new cv.Mat();
    cv.warpPerspective(g, o, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    const cvs = document.createElement('canvas'); cv.imshow(cvs, o); bases.push(cvs);
    readTable(o, t, ans);
    [f, d, M, o].forEach(x => x.delete());
  });
  g.delete();
  S.cur = { src, quads, ans, bases };
  openSheet();
}
function readTable(o, t, ans) {
  const bs = t === 4, rows = bs ? 6 : 11, cols = bs ? 3 : 5, w = o.cols, h = o.rows, cw = w / cols, ch = h / rows;
  const p = (bs ? S.cfg.padBS : S.cfg.pad) / 100, b = new cv.Mat(), th = new cv.Mat();
  cv.GaussianBlur(o, b, new cv.Size(3, 3), 0);
  cv.adaptiveThreshold(b, th, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 25, S.cfg.C);
  for (let r = 1; r < rows; r++) {          // baris 0 = header
    const rt = [];
    for (let c = 1; c < cols; c++) {        // kolom 0 = "No"
      const x = Math.round(c * cw + cw * p), y = Math.round(r * ch + ch * p), ww = Math.round(cw * (1 - 2 * p)), hh = Math.round(ch * (1 - 2 * p));
      const roi = th.roi(new cv.Rect(x, y, ww, hh)); rt.push(cv.countNonZero(roi) / (ww * hh)); roi.delete();
    }
    ans[bs ? 40 + r : t * 10 + r] = classify(rt, bs ? 'BS' : t < 2 ? 'PG' : 'PGK');
  }
  b.delete(); th.delete();
}
function classify(rt, type) {
  const L = type === 'BS' ? ['B', 'S'] : ['A', 'B', 'C', 'D'], c = S.cfg, mn = c.vmin / 100, mx = c.vmax / 100, cn = c.cancel / 100;
  let sel = [], doubt = false;
  if (type === 'BS') {                       // lingkaran pada B atau S
    const i = rt[0] >= rt[1] ? 0 : 1, m = rt[i], o = rt[1 - i];
    if (m >= mn) { sel = [L[i]]; if (m - o < 0.06) doubt = true }
  } else {
    const v = rt.map((r, i) => r >= mn && r <= mx ? i : -1).filter(i => i >= 0);   // silang valid 18–48%
    if (type === 'PG' && v.length > 1) { v.sort((a, b) => rt[b] - rt[a]); sel = [L[v[0]]]; doubt = true }
    else sel = v.map(i => L[i]);
    if (rt.some(r => r > cn)) doubt = true;  // >50% = coretan ralat (diabaikan, ditandai kuning)
  }
  return { sel, doubt, rt, type, L };
}

/* ===== Skor ===== */
function score(ans, ex) {
  const ks = S.kunci.filter(k => k.ID_Ujian === ex); if (!ks.length) return null;
  const r = { PG: 0, PGK: 0, BS: 0 }, det = {}; let max = 0;
  ks.forEach(k => {
    const no = +k.Nomor_Soal, b = +k.Bobot || 1, a = (ans[no] && ans[no].sel) || [];
    const key = String(k.Kunci).split(',').map(s => s.trim().toUpperCase()).filter(Boolean); let p = 0;
    if (k.Tipe_Soal === 'PGK') { const hit = a.filter(x => key.includes(x)).length, wr = a.length - hit; p = b * Math.max(0, hit - wr) / key.length }
    else p = (a.length === 1 && key.length === 1 && a[0] === key[0]) ? b : 0;
    max += b; r[k.Tipe_Soal] = (r[k.Tipe_Soal] || 0) + p; det[no] = { j: a.join(','), k: key.join(','), s: +p.toFixed(2) };
  });
  const f = x => +x.toFixed(2);
  return { PG: f(r.PG), PGK: f(r.PGK), BS: f(r.BS), total: max ? (r.PG + r.PGK + r.BS) / max * 100 : 0, det };
}

/* ===== Panel Verifikasi ===== */
function openSheet() {
  renderTables(); ['#nopes', '#nama', '#kelas'].forEach(i => $(i).value = ''); $('#lookup').textContent = '';
  recalc(); $('#sheet').classList.remove('translate-y-full'); icons();
}
function closeSheet() { $('#sheet').classList.add('translate-y-full') }
function renderTables() {
  const box = $('#tables'); box.innerHTML = '';
  S.cur.bases.forEach((b, t) => {
    const c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
    c.className = 'rounded-xl border border-slate-200 bg-white ' + (t === 4 ? 'col-span-2 w-1/2 mx-auto' : 'w-full');
    c.onclick = e => tap(e, t, c); box.append(c); S.cur['c' + t] = c; draw(t);
  });
}
function draw(t) {
  const c = S.cur['c' + t], x = c.getContext('2d'), bs = t === 4, rows = bs ? 6 : 11, cols = bs ? 3 : 5, cw = c.width / cols, ch = c.height / rows;
  x.drawImage(S.cur.bases[t], 0, 0); x.lineWidth = 3;
  for (let r = 1; r < rows; r++) {
    const a = S.cur.ans[bs ? 40 + r : t * 10 + r];
    a.L.forEach((l, i) => {
      const X = (i + 1) * cw + 4, Y = r * ch + 4, w = cw - 8, h = ch - 8, on = a.sel.includes(l), cn = !on && a.rt[i] > S.cfg.cancel / 100;
      if (on) { x.fillStyle = a.doubt ? 'rgba(245,158,11,.4)' : 'rgba(16,185,129,.4)'; x.strokeStyle = a.doubt ? '#F59E0B' : '#10B981'; x.fillRect(X, Y, w, h); x.strokeRect(X, Y, w, h) }
      else if (cn) { x.strokeStyle = '#F59E0B'; x.setLineDash([6, 4]); x.strokeRect(X, Y, w, h); x.setLineDash([]) }
    });
  }
}
function tap(e, t, c) {
  const r0 = c.getBoundingClientRect(), bs = t === 4, rows = bs ? 6 : 11, cols = bs ? 3 : 5;
  const col = Math.floor((e.clientX - r0.left) / r0.width * cols), row = Math.floor((e.clientY - r0.top) / r0.height * rows);
  if (row < 1 || col < 1) return;
  const a = S.cur.ans[bs ? 40 + row : t * 10 + row], l = a.L[col - 1], i = a.sel.indexOf(l);
  if (a.type === 'PGK') { i >= 0 ? a.sel.splice(i, 1) : a.sel.push(l); a.sel.sort() } else a.sel = i >= 0 ? [] : [l];
  a.doubt = false; draw(t); recalc();
}
function recalc() {
  const r = S.cur.score = score(S.cur.ans, S.exam);
  $('#sc').textContent = r ? r.total.toFixed(1) : '–';
  $('#scd').textContent = r ? `PG ${r.PG} · PGK ${r.PGK} · B/S ${r.BS}` : 'Kunci ujian belum dimuat';
  const d = Object.values(S.cur.ans).filter(a => a.doubt).length;
  $('#dbt').textContent = d ? `${d} soal ragu (kuning)` : 'Semua terdeteksi jelas';
}
$('#nopes').oninput = () => {
  const v = $('#nopes').value.trim(), s = S.siswa.find(x => String(x.Nomor_Peserta).trim() === v);
  if (s) { $('#nama').value = s.Nama_Siswa; $('#kelas').value = s.Kelas }
  $('#lookup').textContent = v ? (s ? '✓ Siswa ditemukan' : 'Tidak ada di Master_Siswa — isi nama manual') : '';
  $('#lookup').style.color = s ? '#059669' : '#D97706';
};
$('#btnClose').onclick = closeSheet;
$('#btnMan').onclick = () => { closeSheet(); manual(S.cur.src) };
$('#btnSave').onclick = () => {
  const no = $('#nopes').value.trim(); if (!no) return toast('Isi Nomor Peserta dulu', 'warn');
  const r = S.cur.score; if (!r) return toast('Kunci jawaban ujian ini belum ada', 'err');
  const it = { id_ujian: S.exam, nomor_peserta: no, nama_siswa: $('#nama').value.trim(), kelas: $('#kelas').value.trim(), skor_pg: r.PG, skor_pgk: r.PGK, skor_bs: r.BS, total_nilai: +r.total.toFixed(2), detail: r.det, timestamp: new Date().toISOString(), synced: false };
  S.hasil = S.hasil.filter(h => !(h.id_ujian === it.id_ujian && h.nomor_peserta === no)); S.hasil.push(it);
  save(); closeSheet(); status(); toast('Tersimpan ke antrean lokal');
  if (navigator.onLine && S.url) sync(true);
};

/* ===== Mode Manual 4 Titik ===== */
function manual(src) {
  S.man = { src, pts: [], quads: [] }; const c = $('#manC'); c.width = src.width; c.height = src.height;
  $('#man').classList.remove('hidden'); mdraw();
}
function mdraw() {
  const m = S.man, c = $('#manC'), x = c.getContext('2d'), r = Math.max(7, c.width / 80); x.drawImage(m.src, 0, 0);
  [...m.quads.flat().map(p => [p, '#10B981']), ...m.pts.map(p => [p, '#F59E0B'])].forEach(([p, col]) => { x.fillStyle = col; x.beginPath(); x.arc(p[0], p[1], r, 0, 7); x.fill() });
  const n = m.quads.length;
  $('#manT').textContent = `Tabel ${n + 1}/5 (${n < 4 ? 'PG ' + ['1–10', '11–20', '21–30', '31–40'][n] : 'Benar–Salah'}) — ketuk sudut ${['kiri-atas', 'kanan-atas', 'kanan-bawah', 'kiri-bawah'][m.pts.length]}`;
}
$('#manC').onclick = e => {
  const m = S.man, c = e.target, r = c.getBoundingClientRect();
  m.pts.push([(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]);
  if (m.pts.length === 4) { m.quads.push(m.pts); m.pts = [] }
  if (m.quads.length === 5) { $('#man').classList.add('hidden'); const q = m.quads, s = m.src; S.man = null; finish(s, q) } else mdraw();
};
$('#manUndo').onclick = () => { const m = S.man; if (!m) return; if (m.pts.length) m.pts.pop(); else if (m.quads.length) m.pts = m.quads.pop().slice(0, 3); mdraw() };
$('#manCancel').onclick = () => { S.man = null; $('#man').classList.add('hidden') };

/* ===== Kunci, Rekap, Pengaturan ===== */
function fillExam() {
  const ex = exams(); if (!ex.includes(S.exam)) S.exam = ex[0] || '';
  $$('.examSel').forEach(s => {
    s.innerHTML = ex.length ? ex.map(e => `<option ${e === S.exam ? 'selected' : ''}>${esc(e)}</option>`).join('') : '<option value="">(belum ada kunci — muat di Pengaturan)</option>';
    s.onchange = () => { S.exam = s.value; save(); fillExam(); renderKunci() };
  });
}
function renderKunci() {
  fillExam();
  const ks = S.kunci.filter(k => k.ID_Ujian === S.exam).sort((a, b) => a.Nomor_Soal - b.Nomor_Soal);
  const col = { PG: 'bg-indigo-50 text-indigo-700', PGK: 'bg-violet-50 text-violet-700', BS: 'bg-sky-50 text-sky-700' };
  $('#kInfo').textContent = ks.length ? `${ks[0].Mata_Pelajaran} · ${ks.length} soal` : 'Belum ada kunci. Isi sheet Kunci_Jawaban lalu muat dari Pengaturan.';
  $('#kGrid').innerHTML = ks.map(k => `<div class="rounded-xl py-2 text-center ${col[k.Tipe_Soal] || ''}"><div class="text-[10px] opacity-60">${esc(k.Nomor_Soal)}</div><div class="font-bold text-sm">${esc(k.Kunci)}</div></div>`).join('');
}
function renderRekap() {
  const L = [...S.hasil].sort((a, b) => b.timestamp.localeCompare(a.timestamp)), n = L.length;
  const avg = n ? L.reduce((s, h) => s + h.total_nilai, 0) / n : 0;
  $('#rStat').innerHTML = [['Siswa', n], ['Rata-rata', avg.toFixed(1)], ['Tertinggi', n ? Math.max(...L.map(h => h.total_nilai)).toFixed(1) : '–']]
    .map(([a, b]) => `<div class="bg-white rounded-2xl p-3 shadow-sm text-center"><div class="text-xs text-slate-500">${a}</div><div class="text-xl font-extrabold text-indigo-600">${b}</div></div>`).join('');
  $('#rList').innerHTML = L.map(h => {
    const c = h.total_nilai >= 75 ? 'text-emerald-600' : h.total_nilai >= 50 ? 'text-amber-500' : 'text-rose-500';
    return `<div class="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3">
      <div class="text-2xl font-extrabold w-16 text-center ${c}">${h.total_nilai.toFixed(0)}</div>
      <div class="flex-1 min-w-0"><div class="font-bold truncate">${esc(h.nama_siswa || '(tanpa nama)')}</div>
      <div class="text-xs text-slate-500">${esc(h.nomor_peserta)} · ${esc(h.kelas)} · ${esc(h.id_ujian)}</div></div>
      <span class="pill ${h.synced ? 'ok' : 'warn'}"><span>${h.synced ? 'Terkirim' : 'Antre'}</span></span>
      <button data-del="${esc(h.id_ujian)}|${esc(h.nomor_peserta)}" class="text-slate-400 p-1"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button></div>`;
  }).join('') || '<p class="text-center text-slate-400 py-10">Belum ada hasil koreksi.</p>';
  icons();
}
$('#rList').onclick = e => {
  const b = e.target.closest('[data-del]'); if (!b || !confirm('Hapus hasil ini?')) return;
  S.hasil = S.hasil.filter(h => h.id_ujian + '|' + h.nomor_peserta !== b.dataset.del); save(); status(); renderRekap();
};
const FIELDS = [['empty', 'Batas kosong (%)'], ['vmin', 'Silang valid min (%)'], ['vmax', 'Silang valid maks (%)'], ['cancel', 'Coretan ralat > (%)'], ['pad', 'Padding PG/PGK (%)'], ['padBS', 'Padding B–S (%)'], ['C', 'Konstanta C']];
function renderSet() {
  $('#url').value = S.url;
  $('#cfgBox').innerHTML = FIELDS.map(([k, l]) => `<div><label class="text-[11px] font-bold text-slate-500">${l}</label><input id="cfg_${k}" type="number" class="inp mt-1" value="${S.cfg[k]}"></div>`).join('');
}
$('#btnUrl').onclick = () => {
  if (HAS_URL) return toast('URL sudah diatur di app.js', 'info');
  S.url = $('#url').value.trim(); save(); toast('URL disimpan');
};
$('#btnCfg').onclick = () => { FIELDS.forEach(([k]) => S.cfg[k] = +$('#cfg_' + k).value || DEF[k]); save(); toast('Kalibrasi disimpan') };
$('#btnReset').onclick = () => { if (confirm('Hapus SEMUA hasil lokal (termasuk antrean belum terkirim)?')) { S.hasil = []; save(); status(); toast('Data lokal dihapus', 'info') } };
$('#btnPull').onclick = pull; $('#btnSync').onclick = () => sync(); $('#btnSyncR').onclick = () => sync();

/* ===== Sinkronisasi ===== */
async function pull() {
  if (!S.url) return toast('Atur URL Web App dulu', 'warn');
  try {
    const j = await (await fetch(S.url)).json(); if (j.status !== 'success') throw new Error(j.message || 'Respons tidak valid');
    S.siswa = j.siswa; S.kunci = j.kunci; if (!exams().includes(S.exam)) S.exam = exams()[0] || '';
    save(); fillExam(); toast(`Dimuat: ${j.siswa.length} siswa, ${j.kunci.length} butir kunci`);
  } catch (e) { toast('Gagal memuat: ' + e.message, 'err') }
}
async function sync(silent) {
  if (!S.url) return silent || toast('Atur URL Web App dulu', 'warn');
  const p = S.hasil.filter(h => !h.synced); if (!p.length) return silent || toast('Tidak ada antrean', 'info');
  try {
    const r = await fetch(S.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'saveResults', data: p.map(({ synced, ...x }) => x) }) });
    const j = await r.json(); if (j.status !== 'success') throw new Error(j.message || 'Ditolak server');
    p.forEach(h => h.synced = true); save(); toast(`${j.saved} data tersinkron`);
  } catch (e) { toast('Sinkronisasi gagal: ' + e.message, 'err') }
  status(); renderRekap();
}

/* ===== Init ===== */
window.addEventListener('online', () => { status(); sync(true) }); window.addEventListener('offline', status);
const iv = setInterval(() => { if (window.cv && cv.Mat) { S.cv = true; status(); clearInterval(iv) } }, 400);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
fillExam(); status(); tab('scan');
if (S.url && navigator.onLine && !S.kunci.length) pull();   // pertama kali dibuka: otomatis muat siswa & kunci
