import {foilFinish,isFoilOption} from './foil-options.mjs';

export const isBlindEmbossing=option=>!isFoilOption(option)&&/prægning|emboss|deboss/i.test(option?.impMethod||option?.method||'');
// A visual approximation only: production artwork and colour specifications stay intact.
export function decorationPreviewColor(option,{foil,productHex}={}){
 if(isFoilOption(option))return foilFinish(foil)?.hex||null;
 if(/gravering|engraving/i.test(option?.impMethod||option?.method||''))return '#9e9e9e';
 if(!isBlindEmbossing(option))return null;
 if(!/^#[a-f\d]{6}$/i.test(productHex||''))return '#000000';
 return '#'+productHex.slice(1).match(/../g).map(channel=>Math.round(parseInt(channel,16)*.7).toString(16).padStart(2,'0')).join('');
}
