// PF's decoration guide lists gold and silver for hot stamping.
// Source: https://thedigitalcatalogue.pfconcept.com/pdf/2021_main/office_hoi_2021.pdf
// Product feeds specify technique/placement, but not the supplier foil order codes.
export const foilFinishes=[{id:'gold',label:'Guld',hex:'#b69549'},{id:'silver',label:'Sølv',hex:'#a8adb4'}];
export const isFoilOption=option=>Number(option?.impMethodCode??option?.methodCode)===9||/^HTS/i.test(option?.printCode||'')||/folie\s*prægning|hot stamping/i.test(option?.impMethod||option?.method||'');
export const foilFinish=id=>foilFinishes.find(finish=>finish.id===id);
export function validateFoilFinish(option,finish){
 if(isFoilOption(option))return foilFinish(finish)?'':'Vælg guld eller sølv til folieprægningen.';
 return finish?'Foliefarve kan kun vælges til folieprægning.':'';
}
