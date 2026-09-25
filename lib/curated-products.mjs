// Exact supplier model codes selected by the shop owner. Keeping this as an
// allowlist prevents the broad unbranded catalogue from leaking into the shop.
const bomuldstasker=['119179','120131','120135','120331','120332','120695','120711','120712','120749','120760'];
const andreTasker=['120745'];
const citizenGreenTasker=['1PZ049','1PZ050'];
const rhythm=['130154','130155','130156'];
const penne=['106299','106378','107822'];
const flasker=['100798'];

export const curatedProducts=new Map([
 ...bomuldstasker.map(modelCode=>[modelCode,{brandId:'trykeksperten-select',brand:'Trykeksperten Select',group:'Tasker og rejse',shopCategory:'bomuldstasker'}]),
 ...andreTasker.map(modelCode=>[modelCode,{brandId:'trykeksperten-select',brand:'Trykeksperten Select',group:'Tasker og rejse'}]),
 ...citizenGreenTasker.map(modelCode=>[modelCode,{brandId:'citizen-green',brand:'Citizen Green',group:'Tasker og rejse',shopCategory:'bomuldstasker'}]),
 ...rhythm.map(modelCode=>[modelCode,{brandId:'trykeksperten-select',brand:'Trykeksperten Select',group:'Tasker og rejse'}]),
 ...penne.map(modelCode=>[modelCode,{brandId:'trykeksperten-select',brand:'Trykeksperten Select',group:'Kontor og gaver'}]),
 ...flasker.map(modelCode=>[modelCode,{brandId:'trykeksperten-select',brand:'Trykeksperten Select',group:'Flasker og krus'}])
]);
