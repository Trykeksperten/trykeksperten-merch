const text=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
export function validateBilling(input,customerType){
 if(customerType==='consumer')return null;
 if(customerType!=='business')throw Error('Vælg privatperson eller erhverv.');
 const billing={company:text(input?.company),cvr:text(input?.cvr,20).replace(/\s/g,''),email:text(input?.email,254),reference:text(input?.reference),street:text(input?.street),postalCode:text(input?.postalCode,20),city:text(input?.city),country:text(input?.country,2).toUpperCase(),ean:text(input?.ean,13)};
 if(!billing.company||!/^\d{8}$/.test(billing.cvr)||!/^\S+@\S+\.\S+$/.test(billing.email))throw Error('Udfyld firmanavn, CVR-nummer (8 cifre) og faktura-e-mail.');
 if(billing.ean&&!/^\d{13}$/.test(billing.ean))throw Error('EAN skal være 13 cifre.');
 return billing;
}
