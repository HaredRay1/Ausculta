// Feature extraction for the Resondi fusion lung model (resondi-lung-fusion-v2).
//
// A line-by-line reproduction of model-rebuild/scripts/fusion.py, so the browser feeds the model
// exactly what it was trained on:
//   1. lowpass4k   exact 100-3900 Hz band cut (frequency domain, per 1 s window), then level to
//                  -20 dBFS RMS, clip and truncate to int16
//   2. mfcc        13 MFCCs (scripts' MFCC class: pre-emphasis 0.98, 20 ms frames, 256-pt FFT,
//                  32 mel filters, log, DCT-II ortho, sliding-window mean normalisation, 101 frames)
//   3. spec        log power spectrogram 0-4 kHz: 320-sample frames and hop, Hann, 512-pt FFT, 129 bins
//   4. chroma      12 pitch classes, 50-4000 Hz, 1024-pt Hann frames, hop 320, per-frame max normalisation
// Every feature value is rounded to float16, as the training features were stored.
//
// No browser APIs: the same file runs in Node for the parity check (scripts/check_fusion_features.mjs).

export const SR = 16000;
export const WIN = 16000;
export const SHAPES = { mfcc: [50, 13], spec: [50, 129], chroma: [47, 12] };

// ---------------------------------------------------------------- FFT (radix-2, complex, in place)
const fftCache = new Map();
function fftTables(n) {
  let t = fftCache.get(n);
  if (t) return t;
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
  t = { rev, cos, sin };
  fftCache.set(n, t);
  return t;
}

function fft(re, im) {
  const n = re.length;
  const { rev, cos, sin } = fftTables(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let s = 0; s < n; s += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step], wi = sin[k * step];
        const a = s + k, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

// Power spectrum |rfft(frame, n)|^2 for bins 0..nbins-1. The frame is truncated or zero-padded to n,
// as numpy.fft.rfft(frame, n=n) does.
function powerSpectrum(frame, n, nbins, out) {
  const re = new Float64Array(n), im = new Float64Array(n);
  const m = Math.min(n, frame.length);
  for (let i = 0; i < m; i++) re[i] = frame[i];
  fft(re, im);
  for (let k = 0; k < nbins; k++) out[k] = re[k] * re[k] + im[k] * im[k];
  return out;
}

// ---------------------------------------------------------------- DFT of 16000 points (Bluestein)
const BN = WIN, BM = 32768;
let blue = null;
function bluesteinTables() {
  if (blue) return blue;
  const wr = new Float64Array(BN), wi = new Float64Array(BN);
  for (let k = 0; k < BN; k++) {
    const ang = (Math.PI * ((k * k) % (2 * BN))) / BN;   // exact k^2 mod 2N keeps the phase precise
    wr[k] = Math.cos(ang); wi[k] = -Math.sin(ang);
  }
  const br = new Float64Array(BM), bi = new Float64Array(BM);
  br[0] = wr[0]; bi[0] = -wi[0];
  for (let k = 1; k < BN; k++) { br[k] = br[BM - k] = wr[k]; bi[k] = bi[BM - k] = -wi[k]; }
  fft(br, bi);
  blue = { wr, wi, br, bi };
  return blue;
}

// Forward DFT of a complex sequence of length 16000, in place.
function dft16000(xr, xi) {
  const { wr, wi, br, bi } = bluesteinTables();
  const ar = new Float64Array(BM), ai = new Float64Array(BM);
  for (let k = 0; k < BN; k++) {
    ar[k] = xr[k] * wr[k] - xi[k] * wi[k];
    ai[k] = xr[k] * wi[k] + xi[k] * wr[k];
  }
  fft(ar, ai);
  for (let k = 0; k < BM; k++) {
    const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k];
    ar[k] = r; ai[k] = -i;                       // conjugate: inverse FFT via the forward one
  }
  fft(ar, ai);
  for (let k = 0; k < BN; k++) {
    const r = ar[k] / BM, i = -ai[k] / BM;
    xr[k] = r * wr[k] - i * wi[k];
    xi[k] = r * wi[k] + i * wr[k];
  }
}

// ---------------------------------------------------------------- 1. band cut + levelling
const TARGET_RMS = 32768 * Math.pow(10, -20 / 20);

export function lowpass4k(x) {
  const re = new Float64Array(BN), im = new Float64Array(BN);
  for (let i = 0; i < BN; i++) re[i] = x[i];
  dft16000(re, im);
  // Keep bins 100..3900 Hz (bin k = k Hz at this length) and their mirror images; zero the rest.
  for (let k = 0; k < BN; k++) {
    const f = k <= BN / 2 ? k : BN - k;
    if (f < 100 || f > 3900) { re[k] = 0; im[k] = 0; }
  }
  // Inverse DFT: conj(DFT(conj(X))) / N; the result is real.
  for (let k = 0; k < BN; k++) im[k] = -im[k];
  dft16000(re, im);
  const y = new Float64Array(BN);
  let ss = 0;
  for (let i = 0; i < BN; i++) { y[i] = re[i] / BN; ss += y[i] * y[i]; }
  const g = TARGET_RMS / (Math.sqrt(ss / BN) + 1e-3);
  const out = new Float64Array(BN);
  for (let i = 0; i < BN; i++) {
    let v = y[i] * g;
    v = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
    out[i] = Math.trunc(v);                       // numpy astype(int16) truncates toward zero
  }
  return out;
}

// ---------------------------------------------------------------- float16 rounding
export function f16(x) {
  if (x === 0 || !Number.isFinite(x)) return x;
  const s = x < 0 ? -1 : 1, a = Math.abs(x);
  if (a >= 65520) return s * Infinity;
  let e = Math.floor(Math.log2(a));
  if (Math.pow(2, e) > a) e -= 1;
  else if (Math.pow(2, e + 1) <= a) e += 1;
  if (e < -14) e = -14;                           // subnormals share the smallest exponent
  const ulp = Math.pow(2, e - 10);
  const q = a / ulp;
  let r = Math.floor(q);
  const d = q - r;
  if (d > 0.5 || (d === 0.5 && r % 2 === 1)) r += 1;
  return s * r * ulp;
}

function hann(m) {
  const w = new Float64Array(m);
  for (let i = 0; i < m; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (m - 1));
  return w;
}

// ---------------------------------------------------------------- 2. MFCC
const MF = { flen: 320, step: 320, nfft: 256, nfilt: 32, ncep: 13, win: 101, pre: 0.98 };
let mfTables = null;
function mfccTables() {
  if (mfTables) return mfTables;
  const mel = (hz) => 1127.0 * Math.log(1 + hz / 700.0);
  const hz = (m) => 700.0 * (Math.exp(m / 1127.0) - 1);
  const lo = mel(0), hi = mel(SR / 2), n = MF.nfilt + 2;
  const bins = [];
  for (let i = 0; i < n; i++) bins.push(Math.floor(((MF.nfft + 1) * hz(lo + ((hi - lo) * i) / (n - 1))) / SR));
  const nb = MF.nfft / 2 + 1;
  const fb = [];
  for (let i = 0; i < MF.nfilt; i++) {
    const row = new Float64Array(nb);
    const l = bins[i], c = bins[i + 1], r = bins[i + 2];
    for (let k = l; k < c; k++) row[k] = Math.fround((k - l) / Math.max(c - l, 1));
    for (let k = c; k < r; k++) row[k] = Math.fround((r - k) / Math.max(r - c, 1));
    fb.push(row);
  }
  const dct = [];
  for (let k = 0; k < MF.ncep; k++) {
    const row = new Float64Array(MF.nfilt);
    const scale = k === 0 ? Math.sqrt(1 / MF.nfilt) : Math.sqrt(2 / MF.nfilt);
    for (let j = 0; j < MF.nfilt; j++) row[j] = scale * Math.cos((Math.PI * k * (2 * j + 1)) / (2 * MF.nfilt));
    dct.push(row);
  }
  mfTables = { fb, dct, nb };
  return mfTables;
}

const EPS32 = 1.1920928955078125e-7;

export function mfcc(x) {
  const { fb, dct, nb } = mfccTables();
  const sig = new Float64Array(x.length);
  sig[0] = x[0];
  for (let i = 1; i < x.length; i++) sig[i] = x[i] - MF.pre * x[i - 1];
  const nfr = 1 + Math.floor((sig.length - MF.flen) / MF.step);
  const feats = [];
  const p = new Float64Array(nb);
  for (let f = 0; f < nfr; f++) {
    powerSpectrum(sig.subarray(f * MF.step, f * MF.step + MF.flen), MF.nfft, nb, p);
    const logE = new Float64Array(MF.nfilt);
    for (let i = 0; i < MF.nfilt; i++) {
      let e = 0;
      const row = fb[i];
      for (let k = 0; k < nb; k++) e += (p[k] / MF.nfft) * row[k];
      logE[i] = Math.log(e === 0 ? EPS32 : e);
    }
    const c = new Float64Array(MF.ncep);
    for (let k = 0; k < MF.ncep; k++) { let s = 0; for (let j = 0; j < MF.nfilt; j++) s += dct[k][j] * logE[j]; c[k] = s; }
    feats.push(c);
  }
  // Sliding-window mean normalisation with numpy's "symmetric" padding.
  const n = feats.length, half = (MF.win - 1) >> 1;
  const at = (j) => (j < half ? feats[half - 1 - j] : j < half + n ? feats[j - half] : feats[n - 1 - (j - half - n)]);
  const out = new Float32Array(n * MF.ncep);
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < MF.ncep; k++) {
      let s = 0;
      for (let j = t; j < t + MF.win; j++) s += at(j)[k];
      out[t * MF.ncep + k] = f16(feats[t][k] - s / MF.win);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 3. spectrogram
const HANN320 = hann(320);
export function spec(x) {
  const nfr = 1 + Math.floor((x.length - 320) / 320);
  const out = new Float32Array(nfr * 129);
  const fr = new Float64Array(320), p = new Float64Array(129);
  for (let f = 0; f < nfr; f++) {
    for (let i = 0; i < 320; i++) fr[i] = (x[f * 320 + i] / 32768.0) * HANN320[i];
    powerSpectrum(fr, 512, 129, p);
    for (let k = 0; k < 129; k++) out[f * 129 + k] = f16(10 * Math.log10(p[k] + 1e-10));
  }
  return out;
}

// ---------------------------------------------------------------- 4. chromagram
const HANN1024 = hann(1024);
function roundHalfEven(v) {
  const r = Math.round(v);
  return Math.abs(v - Math.trunc(v)) === 0.5 ? 2 * Math.round(v / 2) : r;
}
let chromaPc = null;
function chromaClasses() {
  if (chromaPc) return chromaPc;
  chromaPc = new Int32Array(513).fill(-1);
  for (let k = 0; k < 513; k++) {
    const f = (k * SR) / 1024;
    if (f >= 50 && f <= 4000) chromaPc[k] = ((roundHalfEven(12 * Math.log2(f / 16.352)) % 12) + 12) % 12;
  }
  return chromaPc;
}

export function chroma(x) {
  const pc = chromaClasses();
  const nfr = 1 + Math.floor((x.length - 1024) / 320);
  const out = new Float32Array(nfr * 12);
  const fr = new Float64Array(1024), p = new Float64Array(513), c = new Float64Array(12);
  for (let f = 0; f < nfr; f++) {
    for (let i = 0; i < 1024; i++) fr[i] = (x[f * 320 + i] / 32768.0) * HANN1024[i];
    powerSpectrum(fr, 1024, 513, p);
    c.fill(0);
    for (let k = 0; k < 513; k++) if (pc[k] >= 0) c[pc[k]] += p[k];
    let mx = 0;
    for (let j = 0; j < 12; j++) if (c[j] > mx) mx = c[j];
    for (let j = 0; j < 12; j++) out[f * 12 + j] = f16(c[j] / (mx + 1e-10));
  }
  return out;
}

// ---------------------------------------------------------------- one window, and a whole recording
// x: 16000 samples on the int16 scale (-32768..32767).
export function windowFeatures(x) {
  const y = lowpass4k(x);
  return { mfcc: mfcc(y), spec: spec(y), chroma: chroma(y) };
}

// Browser audio (-1..1) -> consecutive non-overlapping 1 s windows on the int16 scale, as the training
// clips were made (float * 32768, clipped, truncated to int16). A recording shorter than 1 s is zero-padded.
export function cutWindows(samples) {
  const starts = [];
  for (let s = 0; s + WIN <= samples.length; s += WIN) starts.push(s);
  if (starts.length === 0) starts.push(0);
  return starts.map((s) => {
    const w = new Float64Array(WIN);
    const end = Math.min(samples.length, s + WIN);
    for (let i = s; i < end; i++) {
      let v = samples[i] * 32768;
      v = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
      w[i - s] = Math.trunc(v);
    }
    return w;
  });
}
