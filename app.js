'use strict';
/* ===== Util & State ===== */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const LSg = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } };
const LSs = (k, v) => localStorage.setItem(k, JSON.stringify(v));
/* >>> PASTE URL WEB APP (hasil deploy Apps Script, berakhiran /exec) DI SINI <<< */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwBcPE3HXwiBnRm-NsfmTENyOZG5Z9uCQDdfio_ZiGohApO81lZ14xdk9v9VuAdYkbg-Q/exec';
const HAS_URL = /^https:\/\/script\.google\.com\/.+\/exec$/.test(GAS_URL.trim());
const DEF = { vmin: 17, vmax: 48, cancel: 50, pad: 10, bsMin: 4, C: 20, Cbs: 10, Cd: 8 };   // hasil kalibrasi pada foto LJK contoh
const S = {
  url: HAS_URL ? GAS_URL.trim() : LSg('ljk_url', ''), siswa: LSg('ljk_siswa', []), kunci: LSg('ljk_kunci', []), hasil: LSg('ljk_hasil', []),
  cfg: { ...DEF, ...LSg('ljk_cfg2', {}) }, exam: LSg('ljk_exam', ''), cv: false, rExam: '*', essayMax: LSg('ljk_essaymax', {}), guru: LSg('ljk_guru', ''), kPend: LSg('ljk_kpend', {}), ed: null, stream: null, cur: null, man: null
};
const save = () => { LSs('ljk_siswa', S.siswa); LSs('ljk_kunci', S.kunci); LSs('ljk_hasil', S.hasil); LSs('ljk_cfg2', S.cfg); LSs('ljk_url', S.url); LSs('ljk_exam', S.exam); LSs('ljk_essaymax', S.essayMax); LSs('ljk_kpend', S.kPend) };
const icons = () => window.lucide && lucide.createIcons();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const exams = () => [...new Set(S.kunci.map(k => k.ID_Ujian))];

function toast(msg, t = 'ok') {
  const c = { ok: 'bg-emerald-600', warn: 'bg-amber-500', err: 'bg-rose-600', info: 'bg-slate-800' }[t];
  const d = document.createElement('div');
  d.className = `${c} text-white text-sm font-semibold px-4 py-3 rounded-2xl shadow-lg transition-all duration-300 opacity-0 -translate-y-2`;
  d.textContent = msg; $('#toasts').append(d);
  requestAnimationFrame(() => d.classList.remove('opacity-0', '-translate-y-2'));
  setTimeout(() => { d.classList.add('opacity-0'); setTimeout(() => d.remove(), 300) }, t === 'err' ? 7000 : 3000);
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
function menu(open) {   // buka/tutup menu garis tiga
  const on = open === undefined ? !$('#menu').classList.contains('open') : open;
  ['#menu', '#menuBg', '#btnMenu'].forEach(s => $(s).classList.toggle('open', on)); $('#btnMenu').setAttribute('aria-expanded', on);
}
$$('[data-tab]').forEach(b => b.onclick = () => { tab(b.dataset.tab); menu(false) });
$('#btnMenu').onclick = () => menu(); $('#menuBg').onclick = () => menu(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape') menu(false) });

/* ===== Kamera & Upload ===== */
/* ===== Kamera: ketuk untuk fokus, flash (torch), zoom, foto resolusi penuh ===== */
let camTrack = null, camCap = {};
async function startCam() {
  if (S.stream) return;
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    $('#vid').srcObject = S.stream; camTrack = S.stream.getVideoTracks()[0]; camInit();
  } catch (e) { toast('Kamera tidak dapat diakses. Gunakan tombol unggah foto.', 'warn') }
}
function stopCam() { S.stream && S.stream.getTracks().forEach(t => t.stop()); S.stream = null; camTrack = null; S.torch = false }
function camInit() {
  const cap = camCap = (camTrack.getCapabilities && camTrack.getCapabilities()) || {};
  if ((cap.focusMode || []).includes('continuous')) camTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => { });
  $('#btnTorch').classList.toggle('hidden', !cap.torch); setTorchIcon(false);
  const z = $('#zoom');
  if (cap.zoom && cap.zoom.max > cap.zoom.min) { z.min = cap.zoom.min; z.max = cap.zoom.max; z.step = cap.zoom.step || 0.1; z.value = (camTrack.getSettings().zoom) || cap.zoom.min; z.classList.remove('hidden') }
  else z.classList.add('hidden');
}
function setTorchIcon(on) {
  const b = $('#btnTorch'); b.innerHTML = `<i data-lucide="${on ? 'zap' : 'zap-off'}" class="w-5 h-5"></i>`;
  b.classList.toggle('!bg-amber-400', on); b.classList.toggle('!text-slate-900', on); icons();
}
$('#btnTorch').onclick = async () => {
  if (!camTrack) return;
  try { await camTrack.applyConstraints({ advanced: [{ torch: !S.torch }] }); S.torch = !S.torch; setTorchIcon(S.torch) }
  catch (e) { toast('Flash tidak dapat dinyalakan di perangkat ini', 'warn') }
};
$('#zoom').oninput = e => { camTrack && camTrack.applyConstraints({ advanced: [{ zoom: +e.target.value }] }).catch(() => { }) };
$('#camBox').addEventListener('click', async e => {   // ketuk layar = fokus di titik itu
  if (!camTrack || e.target.closest('#btnTorch,#zoom')) return;
  const box = $('#camBox'), r = box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, ring = $('#fring');
  ring.style.left = (x - 32) + 'px'; ring.style.top = (y - 32) + 'px'; ring.classList.remove('hidden', 'fpulse'); void ring.offsetWidth; ring.classList.add('fpulse');
  clearTimeout(ring._t); ring._t = setTimeout(() => ring.classList.add('hidden'), 1300);
  const v = $('#vid'), vw = v.videoWidth || r.width, vh = v.videoHeight || r.height, sc = Math.max(r.width / vw, r.height / vh);   // object-cover
  const px = Math.min(1, Math.max(0, (x + (vw * sc - r.width) / 2) / (vw * sc))), py = Math.min(1, Math.max(0, (y + (vh * sc - r.height) / 2) / (vh * sc)));
  const modes = camCap.focusMode || [], mode = modes.includes('single-shot') ? 'single-shot' : modes.includes('continuous') ? 'continuous' : null;
  const tries = [{ ...(mode && { focusMode: mode }), pointsOfInterest: [{ x: px, y: py }] }, ...(mode ? [{ focusMode: mode }] : [])];
  let ok = false;
  for (const adv of tries) { try { await camTrack.applyConstraints({ advanced: [adv] }); ok = true; break } catch (_) { } }
  if (!ok) return S.noFocusMsg || (S.noFocusMsg = 1, toast('Fokus manual tidak didukung perangkat ini — autofokus bawaan tetap aktif', 'info'));
  if (mode === 'single-shot' && modes.includes('continuous')) setTimeout(() => { camTrack && camTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => { }) }, 2500);
});
function blobToCanvas(blob) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { const s = Math.min(1, 1800 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(im.src); res(c) };
    im.onerror = () => rej(new Error('foto tidak terbaca')); im.src = URL.createObjectURL(blob);
  });
}
$('#btnCap').onclick = async () => {
  const v = $('#vid'); if (!v.videoWidth) return toast('Kamera belum siap', 'warn');
  let c = null;
  if (camTrack && window.ImageCapture) {   // foto resolusi penuh (lebih tajam untuk OMR); gagal -> ambil dari frame video
    try { const blob = await Promise.race([new ImageCapture(camTrack).takePhoto(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 5000))]); c = await blobToCanvas(blob) } catch (e) { c = null }
  }
  if (!c) { c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0) }
  run(c);
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
/* Deteksi otomatis 5 tabel: 4 tabel sejajar (No. 1-40) + 1 tabel Benar-Salah di kiri bawah */
function orderCorners(pts) {   // -> [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
  pts.sort((a, b) => a.y - b.y);
  const top = pts.slice(0, 2).sort((a, b) => a.x - b.x), bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}
// binaryMat = topeng GARIS tabel (putih di latar hitam), lihat detect()
function autoDetectTables(binaryMat, imgWidth, imgHeight) {
  const imgArea = imgWidth * imgHeight, ks = Math.max(5, Math.round(imgWidth * 0.0085)) | 1;
  const closed = new cv.Mat(), kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(ks, ks));
  cv.morphologyEx(binaryMat, closed, cv.MORPH_CLOSE, kernel);          // 1. tambal garis tabel yang putus-putus
  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);  // hanya kontur terluar
  const boxes = [];
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i), area = cv.contourArea(cnt);
    if (area >= imgArea * 0.02 && area <= imgArea * 0.15) {            // 2. buang sel kecil (<2%) & bingkai kertas (>15%)
      const rect = cv.boundingRect(cnt), ar = rect.width / rect.height;
      if (rect.y >= imgHeight * 0.25 && ar >= 0.4 && ar <= 1.45) {     // 3. abaikan header (y<25%); 4. rasio tabel
        const hull = new cv.Mat(), approx = new cv.Mat();
        cv.convexHull(cnt, hull);                                      // coretan di luar garis tidak merusak bentuk
        cv.approxPolyDP(hull, approx, 0.035 * cv.arcLength(hull, true), true);
        if (approx.rows === 4) {
          const pts = []; for (let j = 0; j < 4; j++) pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
          boxes.push({ rect, area, points: orderCorners(pts) });
        }
        hull.delete(); approx.delete();
      }
    }
    cnt.delete();
  }
  closed.delete(); kernel.delete(); contours.delete(); hierarchy.delete();
  if (boxes.length > 5) boxes.sort((a, b) => b.area - a.area).length = 5;   // kelebihan kandidat: ambil 5 terbesar
  if (boxes.length === 5) {                                            // 5. urutkan: 4 tabel atas (kiri→kanan) + 1 tabel bawah
    boxes.sort((a, b) => a.rect.y - b.rect.y);
    const top4 = boxes.slice(0, 4).sort((a, b) => a.rect.x - b.rect.x);
    return [...top4, boxes[4]];                                        // [1-10, 11-20, 21-30, 31-40, B/S]
  }
  return null;                                                         // belum 5 tabel -> fallback manual
}
function detect(src) {
  // Kerja di lebar 1280px agar parameter konsisten untuk foto berukuran berapa pun
  const m = cv.imread(src), g0 = new cv.Mat(), g = new cv.Mat(), b = new cv.Mat(), bin = new cv.Mat(), hl = new cv.Mat(), vl = new cv.Mat(), grid = new cv.Mat();
  cv.cvtColor(m, g0, cv.COLOR_RGBA2GRAY);
  const W = 1280, sc = W / g0.cols, H = Math.round(g0.rows * sc);
  cv.resize(g0, g, new cv.Size(W, H), 0, 0, cv.INTER_AREA);
  cv.GaussianBlur(g, b, new cv.Size(3, 3), 0);
  cv.adaptiveThreshold(b, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, Math.round(W * 0.043) | 1, S.cfg.Cd);
  // Garis tabel foto kopi sering putus & tipis: ambil hanya garis horizontal/vertikal, abaikan tulisan & coretan
  const kh = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.floor(W * 0.015), 1));
  const kv = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, Math.floor(H * 0.008)));
  cv.morphologyEx(bin, hl, cv.MORPH_OPEN, kh); cv.morphologyEx(bin, vl, cv.MORPH_OPEN, kv); cv.bitwise_or(hl, vl, grid);
  const res = autoDetectTables(grid, W, H);
  [m, g0, g, b, bin, hl, vl, grid, kh, kv].forEach(x => x.delete());
  return res ? res.map(o => o.points.map(q => [q.x / sc, q.y / sc])) : null;
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
/* Geometri LJK (pecahan dari ukuran tabel hasil warp). Baris header tabel lebih pendek dari baris soal. */
const GEO = { pg: { hdr: 0.072, row: 0.0928, no: 0.223 }, bs: { hdr: 0.214, row: 0.157, no: 0.2 } };
function cell(t, r, c) {   // r, c mulai dari 1 (di luar header & kolom No) -> pecahan 0..1
  const g = t === 4 ? GEO.bs : GEO.pg, cw = (1 - g.no) / (t === 4 ? 2 : 4);
  return { x: g.no + (c - 1) * cw, y: g.hdr + (r - 1) * g.row, w: cw, h: g.row };
}
function readTable(o, t, ans) {
  const bs = t === 4, w = o.cols, h = o.rows, b = new cv.Mat(), th = new cv.Mat();
  cv.GaussianBlur(o, b, new cv.Size(3, 3), 0);
  cv.adaptiveThreshold(b, th, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 41, bs ? S.cfg.Cbs : S.cfg.C);
  const ratio = (x, y, ww, hh) => {
    x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y)); ww = Math.min(w - x, Math.round(ww)); hh = Math.min(h - y, Math.round(hh));
    const roi = th.roi(new cv.Rect(x, y, ww, hh)), v = cv.countNonZero(roi) / (ww * hh); roi.delete(); return v;
  };
  const n = bs ? 5 : 10, m = bs ? 2 : 4, p = S.cfg.pad / 100;
  for (let r = 1; r <= n; r++) {
    const rt = [];
    for (let c = 1; c <= m; c++) {
      const q = cell(t, r, c);
      if (bs) {   // lingkaran bolpoin melingkari huruf: ukur pita di kiri & kanan huruf (huruf cetak sendiri tidak ikut terhitung)
        const cx = (q.x + q.w / 2) * w, cy = (q.y + q.h / 2) * h, a = 0.027 * w, bb = 0.053 * w, dy = 0.025 * h;
        rt.push((ratio(cx - bb, cy - dy, bb - a, 2 * dy) + ratio(cx + a, cy - dy, bb - a, 2 * dy)) / 2);
      } else rt.push(ratio((q.x + q.w * p) * w, (q.y + q.h * p) * h, q.w * (1 - 2 * p) * w, q.h * (1 - 2 * p) * h));
    }
    ans[bs ? 40 + r : t * 10 + r] = classify(rt, bs ? 'BS' : t < 2 ? 'PG' : 'PGK');
  }
  b.delete(); th.delete();
}
function classify(rt, type) {
  const L = type === 'BS' ? ['B', 'S'] : ['A', 'B', 'C', 'D'], c = S.cfg, mn = c.vmin / 100, mx = c.vmax / 100, cn = c.cancel / 100;
  let sel = [], doubt = false;
  if (type === 'BS') {                       // lingkaran pada B atau S
    const i = rt[0] >= rt[1] ? 0 : 1, m = rt[i], o = rt[1 - i], bm = c.bsMin / 100;
    if (m >= bm) { sel = [L[i]]; if (o >= bm) doubt = true }   // kedua huruf ada tanda -> ragu
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
    const key = String(k.Kunci).split(',').map(s => s.trim().toUpperCase()).filter(Boolean); let p = 0, mx = b;
    if (k.Tipe_Soal === 'PGK') { p = a.filter(x => key.includes(x)).length; mx = key.length }   // PGK: tiap jawaban benar = 1 poin (benar keduanya = 2)
    else p = (a.length === 1 && key.length === 1 && a[0] === key[0]) ? b : 0;
    max += mx; r[k.Tipe_Soal] = (r[k.Tipe_Soal] || 0) + p; det[no] = { j: a.join(','), k: key.join(','), s: +p.toFixed(2) };
  });
  const f = x => +x.toFixed(2);
  return { PG: f(r.PG), PGK: f(r.PGK), BS: f(r.BS), max, total: max ? (r.PG + r.PGK + r.BS) / max * 100 : 0, det };
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
  const c = S.cur['c' + t], x = c.getContext('2d'), bs = t === 4, n = bs ? 5 : 10;
  x.drawImage(S.cur.bases[t], 0, 0); x.lineWidth = 3;
  for (let r = 1; r <= n; r++) {
    const a = S.cur.ans[bs ? 40 + r : t * 10 + r];
    a.L.forEach((l, i) => {
      const q = cell(t, r, i + 1), X = q.x * c.width + 3, Y = q.y * c.height + 3, w = q.w * c.width - 6, h = q.h * c.height - 6;
      const on = a.sel.includes(l), cn = !bs && !on && a.rt[i] > S.cfg.cancel / 100;
      if (on) { x.fillStyle = a.doubt ? 'rgba(245,158,11,.4)' : 'rgba(16,185,129,.4)'; x.strokeStyle = a.doubt ? '#F59E0B' : '#10B981'; x.fillRect(X, Y, w, h); x.strokeRect(X, Y, w, h) }
      else if (cn) { x.strokeStyle = '#F59E0B'; x.setLineDash([6, 4]); x.strokeRect(X, Y, w, h); x.setLineDash([]) }
    });
  }
}
function tap(e, t, c) {
  const r0 = c.getBoundingClientRect(), bs = t === 4, g = bs ? GEO.bs : GEO.pg, m = bs ? 2 : 4, n = bs ? 5 : 10;
  const fx = (e.clientX - r0.left) / r0.width, fy = (e.clientY - r0.top) / r0.height;
  const row = Math.floor((fy - g.hdr) / g.row) + 1, col = Math.floor((fx - g.no) / ((1 - g.no) / m)) + 1;
  if (row < 1 || row > n || col < 1 || col > m) return;
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
  const it = { id_ujian: S.exam, nomor_peserta: no, nama_siswa: $('#nama').value.trim(), kelas: $('#kelas').value.trim(), skor_pg: r.PG, skor_pgk: r.PGK, skor_bs: r.BS, total_nilai: +r.total.toFixed(2), detail: r.det, essay: null, timestamp: new Date().toISOString(), synced: false };
  const prev = S.hasil.find(h => h.id_ujian === it.id_ujian && h.nomor_peserta === no); if (prev) it.essay = prev.essay ?? null;
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
  $('#kInfo').textContent = ks.length ? `${ks[0].Mata_Pelajaran} · ${ks.length} soal${S.kPend[S.exam] ? ' · menunggu sinkron' : ''}` : 'Belum ada kunci. Tekan "+ Ujian Baru" untuk membuat, atau muat dari server di Pengaturan.';
  $('#kEdit').disabled = $('#kDel').disabled = !S.exam;
  $('#kGrid').innerHTML = ks.map(k => `<div class="rounded-xl py-2 text-center ${col[k.Tipe_Soal] || ''}"><div class="text-[10px] opacity-60">${esc(k.Nomor_Soal)}</div><div class="font-bold text-sm">${esc(k.Kunci)}</div></div>`).join('');
}
/* ===== Rekap: tabel, Excel, PDF ===== */
const tp = n => n <= 20 ? 'PG' : n <= 40 ? 'PGK' : 'BS', TOT = { PG: 20, PGK: 20, BS: 5 };
const norm = s => String(s || '').split(',').map(t => t.trim()).filter(Boolean).sort().join(',');
// Hitung ulang skor dari rincian jawaban + nilai essay (aturan PGK terbaru, skor maks essay). true bila ada yang berubah.
function reconcile(h) {
  const ans = {}, d = h.detail || {};
  Object.keys(d).forEach(n => ans[n] = { sel: d[n].j ? String(d[n].j).split(',') : [] });
  const r = score(ans, h.id_ujian); if (!r) return false;
  const em = +(S.essayMax[h.id_ujian] || 0), es = h.essay == null || h.essay === '' ? 0 : +h.essay, obj = r.PG + r.PGK + r.BS;
  const nv = { skor_pg: r.PG, skor_pgk: r.PGK, skor_bs: r.BS, total_nilai: +((em > 0 ? (obj + es) / (r.max + em) : obj / r.max) * 100).toFixed(2) };
  const ch = Object.keys(nv).some(k => h[k] !== nv[k]);
  if (ch) { Object.assign(h, nv); h.detail = r.det; h.synced = false }
  return ch;
}
function analyze(h) {
  const d = h.detail || {}, ans = [], st = [], ok = { PG: [], PGK: [], BS: [] }, part = [];
  for (let n = 1; n <= 45; n++) {
    const x = d[n] || { j: '', k: '' }, j = x.j || '', J = norm(j).split(',').filter(Boolean), K = norm(x.k).split(',').filter(Boolean);
    let s = 'kosong';
    if (j) {
      if (tp(n) === 'PGK') { const hit = J.filter(t => K.includes(t)).length; s = hit && hit >= K.length ? 'benar' : hit ? 'sebagian' : 'salah' }
      else s = j === norm(x.k) ? 'benar' : 'salah';
    }
    ans.push(j); st.push(s); if (s === 'benar') ok[tp(n)].push(n); if (s === 'sebagian') part.push(n);
  }
  return { h, nama: h.nama_siswa || '(tanpa nama)', no: String(h.nomor_peserta), kelas: h.kelas || '', nilai: h.total_nilai, ujian: h.id_ujian, ans, st, ok, part };
}
function rekapRows() {
  const ex = S.rExam || '*';
  return S.hasil.filter(h => ex === '*' || h.id_ujian === ex).map(analyze)
    .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));
}
function kunciRow() {   // kunci (array 45) bila rekap menampilkan satu ujian saja
  let ex = S.rExam; if (!ex || ex === '*') { const e = exams(); ex = e.length === 1 ? e[0] : ''; if (!ex || !S.hasil.every(h => h.id_ujian === ex)) return null }
  const k = Array(45).fill('');
  S.kunci.filter(x => x.ID_Ujian === ex).forEach(x => { const n = +x.Nomor_Soal; if (n >= 1 && n <= 45) k[n - 1] = String(x.Kunci) });
  return k.some(Boolean) ? k : null;
}
const ST_CLS = { benar: 'bg-emerald-50 text-emerald-700', salah: 'bg-rose-50 text-rose-600', sebagian: 'bg-amber-50 text-amber-600', kosong: 'text-slate-300' };
function renderRekap() {
  if (S.hasil.map(reconcile).some(Boolean)) { save(); status() }
  const sc = $('#rList').firstElementChild ? $('#rList').firstElementChild.scrollLeft : 0;
  const exs = [...new Set(S.hasil.map(h => h.id_ujian))];
  if (S.rExam !== '*' && !exs.includes(S.rExam)) S.rExam = '*';
  $('#rExam').innerHTML = `<option value="*">Semua ujian</option>` + exs.map(e => `<option ${e === S.rExam ? 'selected' : ''}>${esc(e)}</option>`).join('');
  $('#rExam').onchange = e => { S.rExam = e.target.value; renderRekap() };
  const em = $('#rEssayMax'), one = S.rExam !== '*';
  em.disabled = !one; em.value = one ? (S.essayMax[S.rExam] || 0) : '';
  $('#rEssayHint').textContent = one ? (S.essayMax[S.rExam] > 0 ? 'Essay ikut dihitung ke nilai akhir' : '0 = essay dicatat saja, tidak masuk nilai') : 'Pilih satu ujian untuk mengatur';
  em.onchange = () => { S.essayMax[S.rExam] = Math.max(0, +em.value || 0); save(); renderRekap() };
  const R = rekapRows(), n = R.length, avg = n ? R.reduce((s, r) => s + r.nilai, 0) / n : 0;
  $('#rStat').innerHTML = [['Siswa', n], ['Rata-rata', avg.toFixed(1)], ['Tertinggi', n ? Math.max(...R.map(r => r.nilai)).toFixed(1) : '–']]
    .map(([a, b]) => `<div class="bg-white rounded-2xl p-3 shadow-sm text-center"><div class="text-xs text-slate-500">${a}</div><div class="text-xl font-extrabold text-indigo-600">${b}</div></div>`).join('');
  if (!n) { $('#rList').innerHTML = '<p class="text-center text-slate-400 py-10">Belum ada hasil koreksi.</p>'; return icons() }
  const th = 'px-2 py-2 font-bold text-slate-500 whitespace-nowrap bg-slate-50', ks = kunciRow();
  const nums = Array.from({ length: 45 }, (_, i) => `<th class="px-1 py-2 font-bold text-center w-7 min-w-[28px] bg-slate-50 ${i < 20 ? 'text-indigo-500' : i < 40 ? 'text-violet-500' : 'text-sky-500'}">${i + 1}</th>`).join('');
  const keyRow = ks ? `<tr class="bg-indigo-50"><td class="px-2 py-2"></td><td class="px-2 py-2 font-extrabold text-indigo-700 sticky left-0 bg-indigo-50 z-10">KUNCI</td><td colspan="8" class="px-2 py-2 text-[10px] text-indigo-400">Kunci jawaban</td>
    ${ks.map(k => `<td class="px-0.5 py-1 text-center font-extrabold bg-indigo-100 text-indigo-700">${k ? esc(k.replace(/,/g, '')) : '-'}</td>`).join('')}<td></td></tr>` : '';
  $('#rList').innerHTML = `<div class="overflow-x-auto rounded-2xl bg-white shadow-sm"><table class="text-xs border-collapse w-max min-w-full">
    <thead><tr><th class="${th} text-left">No</th><th class="${th} text-left sticky left-0 z-10">Nama</th><th class="${th} text-left">No. Peserta</th><th class="${th} text-left">Kelas</th><th class="${th} text-center">Nilai</th>
    <th class="${th} text-center">PG</th><th class="${th} text-center">PGK</th><th class="${th} text-center">BS</th><th class="${th} text-center">Essay</th><th class="${th} text-center">Status</th>${nums}<th class="${th}"></th></tr></thead>
    <tbody>${keyRow}${R.map((r, i) => {
      const c = r.nilai >= 75 ? 'text-emerald-600' : r.nilai >= 50 ? 'text-amber-500' : 'text-rose-500', cnt = t => `${r.ok[t].length}/${TOT[t]}`, key = `${r.ujian}|${r.no}`;
      return `<tr class="border-t border-slate-100"><td class="px-2 py-2 text-slate-400">${i + 1}</td>
      <td class="px-2 py-2 font-bold whitespace-nowrap sticky left-0 bg-white z-10 max-w-[150px] truncate">${esc(r.nama)}</td>
      <td class="px-2 py-2 whitespace-nowrap">${esc(r.no)}</td><td class="px-2 py-2 whitespace-nowrap">${esc(r.kelas)}</td>
      <td class="px-2 py-2 text-center font-extrabold text-sm ${c}">${r.nilai.toFixed(1)}</td>
      <td class="px-2 py-2 text-center font-semibold text-indigo-600" title="Skor ${r.h.skor_pg}">${cnt('PG')}</td><td class="px-2 py-2 text-center font-semibold text-violet-600" title="Skor ${r.h.skor_pgk}">${cnt('PGK')}</td><td class="px-2 py-2 text-center font-semibold text-sky-600" title="Skor ${r.h.skor_bs}">${cnt('BS')}</td>
      <td class="px-1 py-1 text-center"><input type="number" inputmode="decimal" step="any" min="0" data-essay="${esc(key)}" value="${r.h.essay ?? ''}" placeholder="–" class="w-16 text-center border border-slate-200 rounded-lg py-1 font-bold focus:outline-none focus:border-indigo-500"></td>
      <td class="px-2 py-2 text-center"><span class="pill ${r.h.synced ? 'ok' : 'warn'}"><span>${r.h.synced ? 'Terkirim' : 'Antre'}</span></span></td>
      ${r.ans.map((a, k) => `<td class="px-0.5 py-1 text-center font-bold ${ST_CLS[r.st[k]]}" title="No. ${k + 1}">${a ? esc(a.replace(/,/g, '')) : '-'}</td>`).join('')}
      <td class="px-2 py-2"><button data-del="${esc(key)}" class="text-slate-400"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  $('#rList').firstElementChild.scrollLeft = sc; icons();
}
$('#rList').addEventListener('change', e => {   // input nilai essay manual
  const k = e.target.dataset && e.target.dataset.essay; if (!k) return;
  const h = S.hasil.find(x => x.id_ujian + '|' + x.nomor_peserta === k); if (!h) return;
  const v = e.target.value.trim(); h.essay = v === '' ? null : Math.max(0, +v); h.synced = false; reconcile(h); save(); status(); renderRekap();
});
function mapelOf() {
  const ids = S.rExam && S.rExam !== '*' ? [S.rExam] : [...new Set(S.hasil.map(h => h.id_ujian))];
  return [...new Set(S.kunci.filter(k => ids.includes(k.ID_Ujian)).map(k => k.Mata_Pelajaran))].join(', ') || '-';
}
const STT = { benar: 'Benar', salah: 'Salah', sebagian: 'Sebagian', kosong: 'Kosong' };
function fname(ext) { return `Rekap_${(S.rExam && S.rExam !== '*' ? S.rExam : 'Semua')}_${new Date().toISOString().slice(0, 10)}.${ext}`.replace(/[^\w.\-]+/g, '_') }
function exportXlsx() {
  if (!window.XLSX) return toast('Pustaka Excel belum termuat — buka sekali saat online', 'warn');
  const R = rekapRows(); if (!R.length) return toast('Belum ada data untuk diunduh', 'warn');
  const nums = Array.from({ length: 45 }, (_, i) => i + 1), ks = kunciRow();
  const pre = [['REKAP NILAI'], ['Ujian', S.rExam && S.rExam !== '*' ? S.rExam : 'Semua ujian'], ['Mata Pelajaran', mapelOf()], ['Guru', S.guru.trim() || '-'], ['Tanggal cetak', new Date().toLocaleDateString('id-ID')], []];
  const head = ['No', 'Nama', 'No. Peserta', 'Kelas', 'ID Ujian', 'Nilai', 'Benar PG', 'Benar PGK', 'Benar BS', 'Skor PG', 'Skor PGK', 'Skor BS', 'Nilai Essay', 'No. Benar PG', 'No. Benar PGK', 'No. Benar BS', 'Sebagian (PGK)'];
  const s1 = [...pre, [...head, ...nums.map(n => 'J' + n)]];
  if (ks) s1.push(['', 'KUNCI', ...Array(head.length - 2).fill(''), ...ks]);   // kunci tepat di atas baris siswa
  R.forEach((r, i) => s1.push([i + 1, r.nama, r.no, r.kelas, r.ujian, +r.nilai.toFixed(2), `${r.ok.PG.length}/${TOT.PG}`, `${r.ok.PGK.length}/${TOT.PGK}`, `${r.ok.BS.length}/${TOT.BS}`,
    r.h.skor_pg, r.h.skor_pgk, r.h.skor_bs, r.h.essay == null ? '' : +r.h.essay, r.ok.PG.join(', '), r.ok.PGK.join(', '), r.ok.BS.join(', '), r.part.join(', '), ...r.ans]));
  const s2 = [...pre, ['No', 'Nama', 'No. Peserta', 'Kelas', ...nums.map(n => 'No. ' + n)]];
  if (ks) s2.push(['', 'KUNCI', '', '', ...ks]);
  R.forEach((r, i) => s2.push([i + 1, r.nama, r.no, r.kelas, ...r.st.map(s => STT[s])]));
  const wb = XLSX.utils.book_new(), w1 = XLSX.utils.aoa_to_sheet(s1), w2 = XLSX.utils.aoa_to_sheet(s2);
  w1['!cols'] = [{ wch: 4 }, { wch: 26 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 8 }, { wch: 9 }, { wch: 10 }, { wch: 9 }, { wch: 8 }, { wch: 9 }, { wch: 8 }, { wch: 11 }, { wch: 28 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, ...nums.map(() => ({ wch: 6 }))];
  w2['!cols'] = [{ wch: 4 }, { wch: 26 }, { wch: 12 }, { wch: 8 }, ...nums.map(() => ({ wch: 9 }))];
  XLSX.utils.book_append_sheet(wb, w1, 'Rekap'); XLSX.utils.book_append_sheet(wb, w2, 'Keterangan Jawaban');
  XLSX.writeFile(wb, fname('xlsx')); toast('File Excel diunduh');
}
function exportPdf() {
  const J = window.jspdf; if (!J || !J.jsPDF) return toast('Pustaka PDF belum termuat — buka sekali saat online', 'warn');
  const R = rekapRows(); if (!R.length) return toast('Belum ada data untuk diunduh', 'warn');
  const doc = new J.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  if (typeof doc.autoTable !== 'function') return toast('Pustaka tabel PDF belum termuat', 'warn');
  const avg = R.reduce((s, r) => s + r.nilai, 0) / R.length, ex = S.rExam && S.rExam !== '*' ? S.rExam : 'Semua ujian';
  doc.setFontSize(14); doc.text('Rekap Nilai - ' + ex, 10, 12);
  doc.setFontSize(9); doc.setTextColor(100); doc.text(`Mata pelajaran: ${mapelOf()}  |  Guru: ${S.guru.trim() || '-'}`, 10, 17);
  doc.text(`${R.length} siswa  |  rata-rata ${avg.toFixed(1)}  |  dicetak ${new Date().toLocaleString('id-ID')}`, 10, 21);
  doc.autoTable({
    startY: 25, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: [79, 70, 229] },
    head: [['No', 'Nama', 'No. Peserta', 'Kelas', 'Nilai', 'Benar PG', 'Benar PGK', 'Benar BS', 'Essay', 'Sebagian PGK']],
    body: R.map((r, i) => [i + 1, r.nama, r.no, r.kelas, r.nilai.toFixed(1), `${r.ok.PG.length}/${TOT.PG}`, `${r.ok.PGK.length}/${TOT.PGK}`, `${r.ok.BS.length}/${TOT.BS}`, r.h.essay == null ? '-' : r.h.essay, r.part.length]),
    columnStyles: { 0: { cellWidth: 10 }, 4: { fontStyle: 'bold', halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'center' }, 9: { halign: 'center' } }
  });
  // Halaman keterangan jawaban per nomor: baris KUNCI paling atas, lalu siswa (hijau benar, merah salah, kuning sebagian)
  const ks = kunciRow(), rows = [...(ks ? [{ st: null, cells: ['KUNCI', ...ks.map(k => k.replace(/,/g, ''))] }] : []),
    ...R.map(r => ({ st: r.st, cells: [r.nama, ...r.ans.map(a => a ? a.replace(/,/g, '') : '-')] }))];
  doc.addPage(); doc.setFontSize(12); doc.setTextColor(0); doc.text('Keterangan Jawaban per Nomor', 6, 10);
  doc.setFontSize(7); doc.setTextColor(100); doc.text('Hijau = benar, merah = salah, kuning = sebagian (PGK), - = kosong. No. 1-20 PG, 21-40 PGK, 41-45 Benar-Salah.', 6, 14);
  const cs = { 0: { halign: 'left', cellWidth: 30 } }; for (let i = 1; i <= 45; i++) cs[i] = { cellWidth: 5.5 };
  const COL = { benar: [209, 250, 229], salah: [254, 226, 226], sebagian: [254, 243, 199], kosong: [241, 245, 249] };
  doc.autoTable({
    startY: 17, theme: 'grid', margin: { left: 6, right: 6 }, styles: { fontSize: 5, cellPadding: 0.5, halign: 'center', overflow: 'hidden' }, columnStyles: cs,
    headStyles: { fillColor: [79, 70, 229], fontSize: 5 }, head: [['Nama', ...Array.from({ length: 45 }, (_, i) => String(i + 1))]], body: rows.map(r => r.cells),
    didParseCell: d => { if (d.section === 'body' && d.column.index > 0) { const r = rows[d.row.index]; if (r.st) d.cell.styles.fillColor = COL[r.st[d.column.index - 1]]; else { d.cell.styles.fillColor = [224, 231, 255]; d.cell.styles.fontStyle = 'bold' } } }
  });
  doc.save(fname('pdf')); toast('File PDF diunduh');
}
$('#btnXlsx').onclick = exportXlsx; $('#btnPdf').onclick = exportPdf;
$('#rList').onclick = e => {
  const b = e.target.closest('[data-del]'); if (!b || !confirm('Hapus hasil ini?')) return;
  S.hasil = S.hasil.filter(h => h.id_ujian + '|' + h.nomor_peserta !== b.dataset.del); save(); status(); renderRekap();
};
/* ===== Editor kunci jawaban (input langsung dari web) ===== */
const EDL = n => n > 40 ? ['B', 'S'] : ['A', 'B', 'C', 'D'];
function openEd(id) {
  const rows = id ? S.kunci.filter(k => k.ID_Ujian === id) : [], k = {};
  rows.forEach(r => { k[+r.Nomor_Soal] = String(r.Kunci).split(',').map(s => s.trim().toUpperCase()).filter(Boolean) });
  S.ed = { isNew: !id, k };
  $('#kId').value = id || ''; $('#kId').disabled = !!id; $('#kMapel').value = rows[0] ? rows[0].Mata_Pelajaran : '';
  const bp = rows.find(r => r.Tipe_Soal === 'PG'), bb = rows.find(r => r.Tipe_Soal === 'BS');
  $('#kBPG').value = bp ? +bp.Bobot : 1; $('#kBBS').value = bb ? +bb.Bobot : 1;
  ['#kqPG', '#kqPGK', '#kqBS'].forEach(i => $(i).value = '');
  $('#kEdT').textContent = id ? 'Ubah Kunci Jawaban' : 'Ujian Baru';
  renderEd(); $('#kEd').classList.remove('translate-y-full'); icons();
}
function renderEd() {
  const sec = (t, c, txt) => `<div class="text-xs font-extrabold ${c} mt-4 mb-1">${t} <span class="font-medium text-slate-400">${txt}</span></div>`;
  let h = '';
  for (let n = 1; n <= 45; n++) {
    if (n === 1) h += sec('PILIHAN GANDA 1–20', 'text-indigo-600', '· pilih 1 jawaban');
    if (n === 21) h += sec('PG KOMPLEKS 21–40', 'text-violet-600', '· pilih semua jawaban benar (biasanya 2)');
    if (n === 41) h += sec('BENAR–SALAH 41–45', 'text-sky-600', '· B atau S');
    h += `<div class="flex items-center gap-2 mb-1.5"><span class="w-7 text-xs font-bold text-slate-400 text-right">${n}</span>${EDL(n).map(l => `<button type="button" data-k="${n}" data-l="${l}" class="kb ${S.ed.k[n] && S.ed.k[n].includes(l) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }
  $('#kRows').innerHTML = h;
}
$('#kRows').onclick = e => {
  const b = e.target.closest('.kb'); if (!b) return;
  const n = +b.dataset.k, l = b.dataset.l, cur = S.ed.k[n] || [], i = cur.indexOf(l);
  if (n > 20 && n <= 40) { i >= 0 ? cur.splice(i, 1) : cur.push(l); cur.sort(); S.ed.k[n] = cur; b.classList.toggle('on', i < 0) }   // PGK: boleh >1
  else { S.ed.k[n] = i >= 0 ? [] : [l]; b.parentElement.querySelectorAll('.kb').forEach(x => x.classList.toggle('on', x === b && i < 0)) }
};
$('#kqGo').onclick = () => {   // isi cepat: PG "ABCD...", PGK "AC BD AB ..." (pisah spasi), B/S "BSBBS"
  const pg = $('#kqPG').value.toUpperCase().match(/[A-D]/g) || [], bs = $('#kqBS').value.toUpperCase().match(/[BS]/g) || [];
  const pk = $('#kqPGK').value.toUpperCase().split(/[\s;]+/).map(g => [...new Set(g.match(/[A-D]/g) || [])].sort()).filter(g => g.length);
  pg.slice(0, 20).forEach((l, i) => S.ed.k[i + 1] = [l]); pk.slice(0, 20).forEach((g, i) => S.ed.k[21 + i] = g); bs.slice(0, 5).forEach((l, i) => S.ed.k[41 + i] = [l]);
  renderEd(); toast(`Terisi: ${Math.min(pg.length, 20)} PG, ${Math.min(pk.length, 20)} PGK, ${Math.min(bs.length, 5)} B/S`, 'info');
};
$('#kSave').onclick = () => {
  const id = $('#kId').value.trim(), mapel = $('#kMapel').value.trim();
  if (!id || !mapel) return toast('Isi ID Ujian dan Mata Pelajaran', 'warn');
  if (S.ed.isNew && exams().includes(id)) return toast('ID Ujian sudah ada — pilih ujiannya lalu tekan Ubah Kunci', 'warn');
  const miss = []; for (let n = 1; n <= 45; n++) if (!(S.ed.k[n] && S.ed.k[n].length)) miss.push(n);
  if (miss.length) return toast('Kunci belum lengkap: no. ' + miss.slice(0, 8).join(', ') + (miss.length > 8 ? ` (+${miss.length - 8})` : ''), 'warn');
  const bpg = +$('#kBPG').value || 1, bbs = +$('#kBBS').value || 1;
  const rows = Array.from({ length: 45 }, (_, i) => {
    const n = i + 1, t = n <= 20 ? 'PG' : n <= 40 ? 'PGK' : 'BS';
    return { ID_Ujian: id, Mata_Pelajaran: mapel, Nomor_Soal: String(n), Tipe_Soal: t, Kunci: S.ed.k[n].join(','), Bobot: String(t === 'PG' ? bpg : t === 'BS' ? bbs : 1) };
  });
  S.kunci = S.kunci.filter(k => k.ID_Ujian !== id).concat(rows); S.exam = id; S.kPend[id] = 'save'; save();
  $('#kEd').classList.add('translate-y-full'); fillExam(); renderKunci(); toast('Kunci disimpan'); pushKunci();
};
$('#kClose').onclick = () => $('#kEd').classList.add('translate-y-full');
$('#kNew').onclick = () => openEd(''); $('#kEdit').onclick = () => S.exam && openEd(S.exam);
$('#kDel').onclick = () => {
  if (!S.exam || !confirm(`Hapus kunci ujian "${S.exam}"? Hasil koreksi yang sudah tersimpan tidak ikut terhapus.`)) return;
  const id = S.exam; S.kunci = S.kunci.filter(k => k.ID_Ujian !== id); S.kPend[id] = 'del'; S.exam = exams()[0] || '';
  save(); fillExam(); renderKunci(); toast('Kunci dihapus'); pushKunci();
};
async function pushKunci() {   // kirim perubahan kunci (simpan/hapus) ke Apps Script
  if (!S.url || !navigator.onLine || !Object.keys(S.kPend).length) return;
  for (const id of Object.keys(S.kPend)) {
    try {
      await api({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(S.kPend[id] === 'del' ? { action: 'deleteKunci', id_ujian: id } : { action: 'saveKunci', id_ujian: id, kunci: S.kunci.filter(k => k.ID_Ujian === id) }) });
      delete S.kPend[id]; save(); toast(`Kunci "${id}" tersinkron`);
    } catch (e) { toast('Kunci belum terkirim: ' + e.message, 'warn'); break }
  }
  renderKunci();
}
/* ===== Nama guru ===== */
$('#rGuru').value = S.guru; $('#rGuru').oninput = e => { S.guru = e.target.value; LSs('ljk_guru', S.guru) };

const FIELDS = [['vmin', 'Silang valid min (%)'], ['vmax', 'Silang valid maks (%)'], ['cancel', 'Coretan ralat > (%)'], ['pad', 'Padding PG/PGK (%)'], ['bsMin', 'Lingkaran B/S min (%)'], ['C', 'Konstanta C baca PG'], ['Cbs', 'Konstanta C baca B/S'], ['Cd', 'Konstanta C deteksi tabel']];
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
$('#btnPull').onclick = () => pull();
$('#btnTest').onclick = async () => { try { const j = await api(); toast(`Koneksi OK: ${j.siswa.length} siswa, ${j.kunci.length} butir kunci`) } catch (e) { toast(e.message, 'err') } }; $('#btnSync').onclick = () => sync(); $('#btnSyncR').onclick = () => sync();

/* ===== Sinkronisasi ===== */
async function api(opt) {
  let r;
  try { r = await fetch(S.url, { redirect: 'follow', cache: 'no-store', credentials: 'omit', ...opt }) }
  catch (e) { throw new Error(navigator.onLine ? 'Server tidak terjangkau. Cek deployment Apps Script: Execute as "Me" + akses "Anyone", lalu buka URL /exec di tab incognito.' : 'Perangkat sedang offline') }
  const t = await r.text(); let j;
  try { j = JSON.parse(t) } catch { throw new Error('Respons bukan JSON — deployment belum publik / belum diizinkan / URL salah') }
  if (j.status !== 'success') throw new Error(j.message || 'Ditolak server');
  return j;
}
async function pull(silent) {
  if (!S.url) return toast('Atur URL Web App dulu', 'warn');
  await pushKunci();
  try {
    const j = await api();
    S.siswa = j.siswa; S.kunci = j.kunci.filter(k => !S.kPend[k.ID_Ujian]).concat(S.kunci.filter(k => S.kPend[k.ID_Ujian] === 'save')); if (!exams().includes(S.exam)) S.exam = exams()[0] || '';
    save(); fillExam(); renderKunci(); if (silent !== true) toast(`Dimuat: ${j.siswa.length} siswa, ${j.kunci.length} butir kunci`);
  } catch (e) { toast('Gagal memuat: ' + e.message, 'err') }
}
async function sync(silent) {
  if (!S.url) return silent || toast('Atur URL Web App dulu', 'warn');
  await pushKunci(); S.hasil.forEach(reconcile); const p = S.hasil.filter(h => !h.synced); if (!p.length) return silent || toast('Tidak ada antrean', 'info');
  try {
    const j = await api({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'saveResults', data: p.map(({ synced, ...x }) => x) }) });
    p.forEach(h => h.synced = true); save(); toast(`${j.saved} data tersinkron`);
  } catch (e) { toast('Sinkronisasi gagal: ' + e.message, 'err') }
  status(); renderRekap();
}

/* ===== Init ===== */
window.addEventListener('online', () => { status(); sync(true) }); window.addEventListener('offline', status);
const iv = setInterval(() => { if (window.cv && cv.Mat) { S.cv = true; status(); clearInterval(iv) } }, 400);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
fillExam(); status(); tab('scan');
if (S.url && navigator.onLine) pull(true);   // pertama kali dibuka: otomatis muat siswa & kunci
