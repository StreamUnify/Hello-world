import {watchPaths} from './watch-pages.mjs';
const origin='https://www.streamunify.com';
export function seoResponse(path){
 if(path==='/robots.txt')return {type:'text/plain; charset=utf-8',body:`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`};
 if(path==='/sitemap.xml')return {type:'application/xml; charset=utf-8',body:'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+['/','/about','/privacy','/terms',...watchPaths].map(p=>`  <url><loc>${origin}${p}</loc></url>`).join('\n')+'\n</urlset>\n'};
 return null;
}
