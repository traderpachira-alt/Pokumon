/* ============================================================
   Durum (tarayıcıda saklanır)
   ============================================================ */
export const KEY = 'tahta:v1';
export const state = Object.assign({
  view: 'fiyat', sort: { key: 'turnover', dir: -1 }, preset: 'all', sectors: [], index: '', markets: [], hideTedbir: false, filters: [], watch: [], saved: [],
  compare: ['XU100'], portfolio: [],
  chart: { range: '6A', sma20: false, sma50: true, sma200: true, bb: false, vwma: false, ichi: false, st: false,
           rsi: true, stoch: false, macd: true, fisher: false, atr: false, vol: true, magnet: false, scale: 'lin' },
}, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })());
 // eski sürümdeki 'teknik' görünümü
state.chart.vol ??= true;
 state.chart.scale ??= 'lin';
 // eski kayıtlarda olmayan grafik ayarları
// Eski tekli seçimleri (sector/market) çoklu seçime çevir
export const listOf = (o, key) => Array.isArray(o[key + 's']) ? o[key + 's'] : o[key] ? [o[key]] : [];
if (state.sector) state.sectors = [state.sector];
if (state.market) state.markets = [state.market];
if (!Array.isArray(state.sectors)) state.sectors = [];
if (!Array.isArray(state.markets)) state.markets = [];
delete state.sector;
 delete state.market;
// Kayıttan sonra çalışacak kanca (senkronizasyon modülü bağlanır; böylece durum modülü ona bağımlı olmaz)
export const hooks = { afterPersist: null };
export const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* özel pencere vb. */ } hooks.afterPersist?.(); };
// Birden fazla modülün değiştirdiği arayüz durumu (açık paneller, formlar, silme onayı)
export const ui = {
  savingOpen: false, // tarama kaydetme formu açık mı
  msOpen: null,      // açık çoklu seçim paneli: 'markets' | 'sectors' | 'cols'
  pfForm: null,      // portföy: yeni varlık / kategori-not düzenleme formu
  txForm: null,      // portföy: alım-satım formu {pid, type, date, qty, price, fee, flow}
  pfDelArmed: null,  // iki dokunuşla silme: pozisyon ya da işlem kimliği
};
