const text=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
export function validateBilling(input,customerType,shipping){
 if(customerType==='consumer')return null;
 if(customerType!=='business')throw Error('Vælg privatperson eller erhverv.');
 if(input?.useDeliveryAddress===true){if(!shipping)throw Error('Leveringsadressen skal være udfyldt før fakturaadressen kan gemmes.');input={...input,...Object.fromEntries(['street','postalCode','city','country'].map(key=>[key,shipping[key]]))};}
 const billing={company:text(input?.company),cvr:text(input?.cvr,20).replace(/\s/g,''),email:text(input?.email,254),reference:text(input?.reference),street:text(input?.street),postalCode:text(input?.postalCode,20),city:text(input?.city),country:text(input?.country,2).toUpperCase(),ean:text(input?.ean,13)};
 if(!billing.company||!/^\d{8}$/.test(billing.cvr)||!/^\S+@\S+\.\S+$/.test(billing.email))throw Error('Udfyld firmanavn, CVR-nummer (8 cifre) og faktura-e-mail.');
 if(!billing.street||!/^\d{4}$/.test(billing.postalCode)||!billing.city||billing.country!=='DK')throw Error('Udfyld en komplet dansk fakturaadresse, postnummer, by og land.');
 if(billing.ean&&!/^\d{13}$/.test(billing.ean))throw Error('EAN skal være 13 cifre.');
 return billing;
}
