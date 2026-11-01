export const documentTitles=Object.freeze({confirmation:'Ordrebekræftelse',basis:'Fakturagrundlag',shipment:'Forsendelsesbekræftelse',receipt:'Kvittering'});
export const supportedDocumentType=type=>typeof type==='string'&&Object.hasOwn(documentTitles,type);
