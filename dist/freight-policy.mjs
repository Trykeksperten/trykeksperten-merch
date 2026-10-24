// Customer prices per order in integer øre. PF's supplier cost is separate and unknown here.
export const fixedCustomerFreight=Object.freeze({consumer:Object.freeze({exVat:12000,incVat:15000}),business:Object.freeze({exVat:20000,incVat:25000})});
export function customerFreight(customerType){const rate=['consumer','business'].includes(customerType)?fixedCustomerFreight[customerType]:null;if(!rate)throw Error('Vælg privatperson eller erhverv, før fragtprisen beregnes.');return {...rate};}
