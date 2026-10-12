// Demo only: sample listing photos are hosted on a CDN. If one cannot load
// (offline, blocked network), show a drawn interior instead of a broken image.
(function () {
  'use strict';
  const PALETTES = [
    ['#e9e2d6', '#c9b79c', '#9cc3d9', '#5d6b5f'],
    ['#dfe6e1', '#b9a48a', '#a9cbe0', '#3f5d52'],
    ['#ece4dc', '#a88f76', '#bcd6e6', '#6b4f3f'],
  ];
  function art(seed) {
    const [wall, floor, sky, sofa] = PALETTES[seed % PALETTES.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
      <rect width="600" height="400" fill="${wall}"/>
      <rect y="292" width="600" height="108" fill="${floor}"/>
      <rect x="372" y="62" width="150" height="176" rx="4" fill="#fff" opacity=".9"/>
      <rect x="380" y="70" width="64" height="160" fill="${sky}"/><rect x="450" y="70" width="64" height="160" fill="${sky}"/>
      <path d="M380 200l34-28 30 22v36h-64zM450 214l26-30 38 34v12h-64z" fill="#fff" opacity=".55"/>
      <rect x="70" y="214" width="250" height="70" rx="14" fill="${sofa}"/>
      <rect x="58" y="236" width="30" height="62" rx="10" fill="${sofa}"/><rect x="302" y="236" width="30" height="62" rx="10" fill="${sofa}"/>
      <rect x="84" y="196" width="104" height="44" rx="12" fill="${sofa}" opacity=".85"/><rect x="200" y="196" width="104" height="44" rx="12" fill="${sofa}" opacity=".85"/>
      <rect x="150" y="70" width="90" height="62" rx="2" fill="#fff" opacity=".6"/>
      <circle cx="548" cy="270" r="22" fill="${sofa}" opacity=".35"/><rect x="545" y="270" width="6" height="26" fill="${sofa}" opacity=".5"/>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  window.addEventListener('error', (e) => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG' || t.dataset.rzFallback) return;
    t.dataset.rzFallback = '1';
    t.src = art(hash(t.currentSrc || t.src || ''));
  }, true);
})();
