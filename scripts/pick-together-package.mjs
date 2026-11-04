import {websitePickerHtml} from '../website-branding.mjs';
// Both app platforms use the same live catalog picker as the website.
export function pickTogetherHtml(html){
 if(!html.includes('<main id="top">'))throw Error('Pick Together navigation anchor changed');
 return websitePickerHtml(html);
}
