/* Stella James image engine: rebuilds product images in the browser from the existing Shopify photos.
   Nothing is invented: same photo, cleaned background, consistent scale, soft ivory backdrop, subtle watermark. */
(function () {
  const IVORY = '#F5F4F1', NAVY = '#242577';
  const css = getComputedStyle(document.documentElement);
  const SERIF = (css.getPropertyValue('--serif') || '"Khalos Display",Georgia,serif').trim();
  const COND = (css.getPropertyValue('--cond') || '"Abcdiatypecondensed","Arial Narrow",sans-serif').trim();
  const SANS = (css.getPropertyValue('--sans') || '"DM Sans",sans-serif').trim();
  const SHOP = 'https://cdn.shopify.com/s/files/1/0630/8931/1840/files/';
  const cache = {};
  const load = (u, w) => { const url = u.startsWith('http') || u.startsWith('data:') ? u : SHOP + u;
    const k = url + '|' + (w || 0); if (cache[k]) return cache[k];
    return cache[k] = new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej;
      i.src = url.startsWith('http') ? url + (url.includes('?') ? '&' : '?') + 'width=' + (w || 1800) : url; }); };
  let LOGO = null;
  async function logos() { if (LOGO) return LOGO;
    try { const base = (document.querySelector('meta[name=sj-root]') || {}).content || '';
      const t = await (await fetch(base + 'images/logo.svg')).text();
      const mk = c => load('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t.replace(/fill="#242577"/, 'fill="' + c + '"')));
      const [n, w] = await Promise.race([Promise.all([mk(NAVY), mk('#ffffff')]), new Promise((_, r) => setTimeout(r, 5000))]);
      LOGO = { n, w }; } catch (e) { LOGO = {}; }
    return LOGO; }

  // ---- analysis: background colour, whether it is a clean packshot, product box ----
  function analyze(img) {
    const s = Math.min(1, 700 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    const a = x.getImageData(0, 0, w, h).data, px = (i, j) => { const k = (j * w + i) * 4; return [a[k], a[k + 1], a[k + 2]]; };
    const corners = [[3, 3], [w - 4, 3], [3, h - 4], [w - 4, h - 4], [w >> 1, 3]].map(([i, j]) => px(i, j));
    const bg = [0, 1, 2].map(n => corners.map(c => c[n]).sort((p, q) => p - q)[2]);
    const lum = .299 * bg[0] + .587 * bg[1] + .114 * bg[2];
    const spread = Math.max(...corners.map(c => Math.max(...c.map((v, n) => Math.abs(v - bg[n])))));
    const d = k => Math.max(Math.abs(a[k] - bg[0]), Math.abs(a[k + 1] - bg[1]), Math.abs(a[k + 2] - bg[2]));
    let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0;
    for (let j = 2; j < h - 2; j++) for (let i = 2; i < w - 2; i++) { const k = (j * w + i) * 4; if (d(k) > 38) { n++; if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; } }
    const box = n ? { x: x0 / s, y: y0 / s, w: (x1 - x0) / s, h: (y1 - y0) / s } : { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    // faint reflection below the product?
    let rs = 0, rn = 0; for (let j = y1 + 4; j < Math.min(h - 2, y1 + (y1 - y0) * .5); j++) for (let i = x0; i < x1; i += 3) { rs += d((j * w + i) * 4); rn++; }
    return { bg, lum, packshot: lum > 222 && spread < 20, box, fill: box.h / img.naturalHeight, reflection: rn ? rs / rn > 5 : false };
  }
  // normalised crop: background pushed to pure white, edges feathered, so it can be multiplied onto any light backdrop
  function crop(img, an, r) {
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(r.w)); c.height = Math.max(1, Math.round(r.h));
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data, f = an.bg.map(v => 255 / Math.max(160, v));
    for (let k = 0; k < a.length; k += 4) { a[k] = Math.min(255, a[k] * f[0]); a[k + 1] = Math.min(255, a[k + 1] * f[1]); a[k + 2] = Math.min(255, a[k + 2] * f[2]); }
    x.putImageData(d, 0, 0);
    const fe = Math.min(c.width, c.height) * .14;
    [[0, 0, fe, 0, 0, 0, fe, c.height], [c.width, 0, c.width - fe, 0, c.width - fe, 0, fe, c.height], [0, 0, 0, fe, 0, 0, c.width, fe], [0, c.height, 0, c.height - fe, 0, c.height - fe, c.width, fe]]
      .forEach(([ax, ay, bx, by, rx, ry, rw, rh]) => { const g = x.createLinearGradient(ax, ay, bx, by); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(rx, ry, rw, rh); });
    return c;
  }
  function canvas(W, H, bg) { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, W, H); return [c, x]; }
  function mark(x, W, H, dark) { const L = dark ? LOGO.w : LOGO.n; x.save(); x.globalAlpha = dark ? .6 : .42;
    if (L) { const lw = W * .18, lh = lw * 20 / 166; x.drawImage(L, (W - lw) / 2, H - lh - H * .04, lw, lh); }
    else { x.fillStyle = dark ? '#fff' : NAVY; x.textAlign = 'center'; x.font = '400 ' + (W * .028) + 'px ' + SERIF; x.fillText('STELLA JAMES', W / 2, H * .95); }
    x.restore(); }
  // ---- studio look: warm wall, spotlight, tabletop surface, fine grain ----
  let GRAIN = null;
  function grain() { if (GRAIN) return GRAIN; const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d'), d = x.createImageData(160, 160);
    for (let k = 0; k < d.data.length; k += 4) { const v = 128 + (Math.random() - .5) * 90; d.data[k] = d.data[k + 1] = d.data[k + 2] = v; d.data[k + 3] = 255; } x.putImageData(d, 0, 0); return GRAIN = c; }
  function studio(x, W, H, o) { o = o || {}; const hz = (o.hz == null ? .66 : o.hz) * H, cx = (o.cx || .5) * W, cy = (o.cy || .48) * H;
    let g = x.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, '#E4DDD1'); g.addColorStop(1, '#F3EFE8'); x.fillStyle = g; x.fillRect(0, 0, W, hz);
    g = x.createLinearGradient(0, hz, 0, H); g.addColorStop(0, '#F8F5EF'); g.addColorStop(.35, '#EFE9DF'); g.addColorStop(1, '#DDD4C5'); x.fillStyle = g; x.fillRect(0, hz, W, H - hz);
    g = x.createLinearGradient(0, hz - H * .03, 0, hz + H * .03); g.addColorStop(0, 'rgba(243,239,232,0)'); g.addColorStop(.5, 'rgba(250,248,243,.9)'); g.addColorStop(1, 'rgba(248,245,239,0)'); x.fillStyle = g; x.fillRect(0, hz - H * .03, W, H * .06);
    g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .5); g.addColorStop(0, 'rgba(255,255,253,1)'); g.addColorStop(.45, 'rgba(255,254,250,.55)'); g.addColorStop(1, 'rgba(255,254,250,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .45, W / 2, H / 2, Math.max(W, H) * .78); g.addColorStop(0, 'rgba(60,48,30,0)'); g.addColorStop(1, 'rgba(60,48,30,.16)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.save(); x.globalAlpha = .045; x.globalCompositeOperation = 'overlay'; x.fillStyle = x.createPattern(grain(), 'repeat'); x.fillRect(0, 0, W, H); x.restore(); }
  function sharpen(c, amt) { const x = c.getContext('2d', { willReadFrequently: true }), w = c.width, h = c.height, src = x.getImageData(0, 0, w, h), a = src.data, o = new Uint8ClampedArray(a);
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const k = (j * w + i) * 4;
      for (let n = 0; n < 3; n++) { const v = a[k + n] * (1 + 4 * amt) - amt * (a[k + n - 4] + a[k + n + 4] + a[k + n - w * 4] + a[k + n + w * 4]); o[k + n] = v; } }
    src.data.set(o); x.putImageData(src, 0, 0); return c; }
  // product layer: cleaned, scaled, graded (warmer gold, brighter stones) and sharpened
  function layer(img, an, r, s) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(r.w * s)); c.height = Math.max(1, Math.round(r.h * s));
    const x = c.getContext('2d', { willReadFrequently: true }); x.filter = 'contrast(1.15) saturate(1.15) brightness(1.03)'; x.imageSmoothingQuality = 'high'; x.drawImage(crop(img, an, r), 0, 0, c.width, c.height);
    return sharpen(c, .32); }
  function layout(img, an, W, H, share, cy, opt) { opt = opt || {}; const b = an.box, s = Math.min(H * share / b.h, W * (opt.maxW || .7) / b.w), cx = W * (opt.cx || .5), cyy = H * cy;
    const pad = { l: b.w * .35, r: b.w * .35, t: b.h * .3, b: b.h * (an.reflection ? .7 : .35) };
    const r = { x: Math.max(0, b.x - pad.l), y: Math.max(0, b.y - pad.t) }; r.w = Math.min(img.naturalWidth, b.x + b.w + pad.r) - r.x; r.h = Math.min(img.naturalHeight, b.y + b.h + pad.b) - r.y;
    return { b, s, cx, cyy, r, dx: cx - (b.x + b.w / 2 - r.x) * s, dy: cyy - (b.y + b.h / 2 - r.y) * s, bottom: cyy + b.h * s / 2 }; }
  function placeOn(x, img, an, W, H, share, cy, opt) {
    opt = opt || {}; const L = layout(img, an, W, H, share, cy, opt), { b, s, cx, r, dx, dy } = L, P = layer(img, an, r, s), by = L.bottom;
    if (!opt.noShadow) { // contact shadow
      const g = x.createRadialGradient(cx, by, 2, cx, by, b.w * s * .55); g.addColorStop(0, 'rgba(55,42,22,.30)'); g.addColorStop(.5, 'rgba(55,42,22,.12)'); g.addColorStop(1, 'rgba(55,42,22,0)');
      x.save(); x.translate(cx, by); x.scale(1, .09); x.translate(-cx, -by); x.fillStyle = g; x.fillRect(cx - b.w * s, by - b.w * s, b.w * s * 2, b.w * s * 2); x.restore(); }
    if (!opt.noShadow && !an.reflection) { // mirror reflection on the surface
      const top = (b.y + b.h - r.y) * s, rh = Math.min(P.height - 0, b.h * s * .55), R = document.createElement('canvas'); R.width = P.width; R.height = Math.round(rh);
      const rx = R.getContext('2d'); rx.save(); rx.translate(0, top); rx.scale(1, -1); rx.drawImage(P, 0, 0); rx.restore();
      const g = rx.createLinearGradient(0, 0, 0, R.height); g.addColorStop(0, 'rgba(255,255,255,.62)'); g.addColorStop(.7, 'rgba(255,255,255,1)'); rx.fillStyle = g; rx.fillRect(0, 0, R.width, R.height);
      x.save(); x.globalCompositeOperation = 'multiply'; x.drawImage(R, dx, by + H * .004); x.restore(); }
    x.save(); x.globalCompositeOperation = 'multiply'; x.drawImage(P, dx, dy); x.restore();
  }
  function grade(x, W, H) { const g = x.createRadialGradient(W / 2, H * .45, Math.min(W, H) * .35, W / 2, H * .45, Math.max(W, H) * .75); g.addColorStop(0, 'rgba(25,20,40,0)'); g.addColorStop(1, 'rgba(25,20,40,.28)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  const GRADE = 'contrast(1.1) saturate(1.12) brightness(1.05) sepia(.07)';
  async function packshot(img, o) { o = o || {}; await logos(); const W = o.W || 1600, H = o.H || 2000, an = analyze(img);
    if (!an.packshot) return cover(img, o);
    const share = o.share || .66, cy = o.cy || .47, L = layout(img, an, W, H, share, cy, { maxW: o.maxW }), [c, x] = canvas(W, H, IVORY);
    studio(x, W, H, { hz: Math.min(.86, L.bottom / H - .035), cy: cy }); placeOn(x, img, an, W, H, share, cy, { maxW: o.maxW }); if (o.mark !== false) mark(x, W, H); c._fill = share; c._was = an.fill; return c; }
  async function cover(img, o) { o = o || {}; await logos(); const W = o.W || 1600, H = o.H || 2000, [c, x] = canvas(W, H, '#eee');
    const r = Math.max(W / img.naturalWidth, H / img.naturalHeight), iw = img.naturalWidth * r, ih = img.naturalHeight * r; x.filter = GRADE; x.drawImage(img, (W - iw) / 2, (H - ih) * (o.top || .35), iw, ih); x.filter = 'none'; grade(x, W, H);
    if (o.mark !== false) { const g = x.createLinearGradient(0, H * .82, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.25)'); x.fillStyle = g; x.fillRect(0, H * .82, W, H * .18); mark(x, W, H, true); }
    c._cover = true; return c; }
  // matching pair from a single-earring photo: the earring and its mirror image side by side
  function flip(img) { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d');
    x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(img, 0, 0); c.naturalWidth = c.width; c.naturalHeight = c.height; return c; }
  async function pair(img, o) { o = o || {}; await logos(); const W = o.W || 1600, H = o.H || 2000, an = analyze(img);
    if (!an.packshot) return null; const f = flip(img), af = analyze(f), share = o.share || .42, cy = o.cy || .46, gap = o.gap || .23;
    const L = layout(img, an, W, H, share, cy, { maxW: .36, cx: .5 - gap }), [c, x] = canvas(W, H, IVORY);
    studio(x, W, H, { hz: Math.min(.86, L.bottom / H - .035), cy: cy });
    placeOn(x, f, af, W, H, share, cy, { maxW: .36, cx: .5 - gap }); placeOn(x, img, an, W, H, share, cy, { maxW: .36, cx: .5 + gap });
    if (o.mark !== false) mark(x, W, H); return c; }
  async function closeup(img, f, o) { o = o || {}; await logos(); const W = o.W || 1600, H = o.H || 2000, an = analyze(img), b = an.box;
    const size = b.h * f[2], cxs = b.x + b.w * f[0], cys = b.y + b.h * f[1];
    const sub = { box: { x: cxs - size * .5, y: cys - size * .5, w: size, h: size }, bg: an.bg, reflection: false };
    const [c, x] = canvas(W, H, IVORY); studio(x, W, H, { hz: 1.2, cy: .48 }); placeOn(x, img, sub, W, H, .62, .48, { maxW: .76, noShadow: true }); mark(x, W, H); return c; }
  async function worn(img, pt, o) { o = o || {}; await logos(); const W = o.W || 1600, H = o.H || 2000, [c, x] = canvas(W, H, '#ddd');
    const r = Math.max(W / img.naturalWidth, H / img.naturalHeight), iw = img.naturalWidth * r, ih = img.naturalHeight * r;
    const ox = Math.min(0, Math.max(W - iw, W / 2 - pt[0] * iw)), oy = Math.min(0, Math.max(H - ih, H * .45 - pt[1] * ih)); x.drawImage(img, ox, oy, iw, ih);
    const ex = ox + pt[0] * iw, ey = oy + pt[1] * ih, R = W * .2, z0 = img.naturalWidth < 1500 ? 2.2 : 3.2, cx = ex < W / 2 ? W - R - W * .07 : R + W * .07, cy = ey < H / 2 ? H - R - H * .12 : R + H * .1, z = z0;
    x.save(); x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 3; x.beginPath(); x.arc(ex, ey, W * .035, 0, 7); x.stroke();
    const ang = Math.atan2(cy - ey, cx - ex); x.beginPath(); x.moveTo(ex + Math.cos(ang) * W * .035, ey + Math.sin(ang) * W * .035); x.lineTo(cx - Math.cos(ang) * R, cy - Math.sin(ang) * R); x.stroke();
    x.beginPath(); x.arc(cx, cy, R, 0, 7); x.closePath(); x.shadowColor = 'rgba(20,21,70,.35)'; x.shadowBlur = 40; x.fillStyle = '#fff'; x.fill(); x.shadowColor = 'transparent'; x.clip();
    x.filter = GRADE; x.drawImage(img, cx - pt[0] * iw * z, cy - pt[1] * ih * z, iw * z, ih * z); x.restore();
    x.save(); x.strokeStyle = '#fff'; x.lineWidth = 8; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke(); x.restore();
    const g = x.createLinearGradient(0, H * .82, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.25)'); x.fillStyle = g; x.fillRect(0, H * .82, W, H * .18); mark(x, W, H, true);
    c._hs = { x: ex / W, y: ey / H }; return c; }
  async function card(img, p, o) { o = o || {}; await logos(); const W = o.W || 1600, H = o.H || 2000, an = analyze(img), [c, x] = canvas(W, H, NAVY);
    const pw = W * .72, ph = H * .5, px = (W - pw) / 2, py = H * .1, [pc, pxx] = canvas(Math.round(pw), Math.round(ph), IVORY); const Lc = layout(img, an, pw, ph, .6, .46, { maxW: .7 }); studio(pxx, pw, ph, { hz: Math.min(.88, Lc.bottom / ph - .03), cy: .46 }); placeOn(pxx, img, an, pw, ph, .6, .46, { maxW: .7 });
    x.save(); x.beginPath(); x.roundRect ? x.roundRect(px, py, pw, ph, 18) : x.rect(px, py, pw, ph); x.clip(); x.drawImage(pc, px, py); x.restore();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '400 ' + (W * .07) + 'px ' + SERIF; x.fillText(p.name, W / 2, H * .74, W * .86);
    x.font = '500 ' + (W * .021) + 'px ' + COND; x.fillStyle = 'rgba(255,255,255,.78)'; x.fillText(p.line.toUpperCase(), W / 2, H * .79, W * .86);
    x.font = '400 ' + (W * .031) + 'px ' + SANS; x.fillStyle = '#fff'; x.fillText('$' + p.price.toLocaleString('en-US'), W / 2, H * .845); mark(x, W, H, true); return c; }
  async function original(img, o) { o = o || {}; const W = o.W || 1600, H = o.H || 2000, an = analyze(img), [c, x] = canvas(W, H, 'rgb(' + an.bg.join(',') + ')');
    const r = Math.min(W / img.naturalWidth, H / img.naturalHeight), iw = img.naturalWidth * r, ih = img.naturalHeight * r; x.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih); c._was = an.fill; return c; }
  async function fonts() { try { await document.fonts.ready; await document.fonts.load('400 40px ' + SERIF); await document.fonts.load('500 20px ' + COND); } catch (e) { } }
  const toURL = c => c.toDataURL('image/jpeg', .9);
  const download = (c, n) => new Promise(r => c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n; a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); r(); }, 400); }, 'image/jpeg', .92));
  window.SJIMG = { load, analyze, packshot, pair, cover, closeup, worn, card, original, fonts, toURL, download, SHOP };
})();
