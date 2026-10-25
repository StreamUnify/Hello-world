// Injected by the HTTP server only. The shared native HTML stays unchanged.
export function websiteHtml(html) {
  // Legal documents use an implicit head; their title still anchors metadata.
  return String(html).replace('</head>', websiteBannerStyle + '</head>').replace('<title>', '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48"><link rel="icon" type="image/png" sizes="32x32" href="/favicon.png"><title>');
}
export function websiteIcon(path) {
  if(path==='/favicon.ico')return {file:'favicon.ico',type:'image/x-icon'};
  if(path==='/favicon.png')return {file:'favicon.png',type:'image/png'};
  return null;
}

// The public website gives the provider artwork more room and blends its
// export edges into the hero. Native app layouts retain their own spacing.
const websiteBannerStyle = `<style id="su-website-banner-fit">
.hero .su-original-artwork {
  border-radius: 0;
  background: transparent;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent), linear-gradient(0deg, transparent, #000 24%, #000 95%, transparent);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent), linear-gradient(0deg, transparent, #000 24%, #000 95%, transparent);
  mask-composite: intersect;
}
@media (min-width: 900px) {
  .hero {
    grid-template-columns: minmax(0, 29fr) minmax(0, 71fr);
    padding: 30px;
    column-gap: 18px;
  }
  .hero h1 {font-size: clamp(32px, 3.35vw, 47px); letter-spacing: -1.2px; margin-bottom: 14px;}
  .hero p {font-size: 14px; line-height: 1.55; margin-bottom: 0;}
  .hero .su-original-artwork {
    width: calc(100% + 38px);
    max-width: none;
    margin: -8px -30px 4px -8px;
  }
  .hero .su-search-wrap {width: 96%; margin: 8px auto 0;}
}
@media (max-width: 899px) {
  .hero {padding: 24px 20px;}
  .hero .su-original-artwork {width: calc(100% + 32px); max-width: none; margin: 10px -16px 14px;}
}
</style>`;
