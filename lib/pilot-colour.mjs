import {pilotFreightExVat} from './pilot-freight.mjs';
import {artworkColorChanges} from '../dist/artwork-production-colors.mjs';
// Joakim approved 717 C for this exact original and cap order on 23 Oct 2026.
const approvedHash='bf9c98608c8b1d06f101dba29ccd947581a38f7cda431460141c89e6cc727b88';
export function applyPilotColour(order){
 if(!order.adminPilot)return order;
 const d=order.lines?.[0]?.decorations?.[0];
 if(pilotFreightExVat(order.lines)!==6500||order.totalIncVat!==124613||d?.artworks?.length!==1||d.text?.trim()||d.artworks.some(art=>artworkColorChanges(art).length))throw Error('Testordren skal være de aftalte 10 kasketter med originalt logo, 85 × 25 mm, til 1.246,13 kr.');
 const file=order.artworks?.find(a=>a.id===d.artworks[0].logo.id);
 if(file?.pantone?.sha256!==approvedHash)throw Error('Logoet matcher ikke originalfilen, som 717 C er godkendt til.');
 order.pfColourOverrides={'0:0':['717 C']};
 order.events.push({at:new Date().toISOString(),type:'pilot_colour_confirmed',code:'717 C',source:'Joakim approved PF colour match',artworkSha256:approvedHash});
 return order;
}
