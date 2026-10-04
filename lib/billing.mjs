const text=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
export function validateBilling(input,customerType){
 if(customerType==='consumer')return null;
 if(customerType!=='business')throw Error('Vælg privatperson eller erhverv.');
 const billing={company:text(input?.company),cvr:text(input?.cvr,20).replace(/\s/g,''),email:text(input?.email,254),reference:text(input?.reference)};
 if(!billing.company||!/^\d{8}$/.test(billing.cvr)||!/^\S+@\S+\.\S+$/.test(billing.email))throw Error('Udfyld firmanavn, CVR-nummer (8 cifre) og faktura-e-mail.');
 return billing;
}
