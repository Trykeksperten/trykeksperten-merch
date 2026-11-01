import {preparePublicJSON,sendPreparedJSON} from './json-response.mjs';
// One revision only: no unbounded cache of historical catalogues or visibility states.
export function createCatalogResponse({loadCatalog,readAssortment,publicAssortment}){
 let cached;
 return async(req,res)=>{
  const [catalog,state]=await Promise.all([loadCatalog(),readAssortment()]);
  const visibility=JSON.stringify(state);
  if(!cached||cached.catalog!==catalog||cached.visibility!==visibility){
   const prepared=preparePublicJSON(publicAssortment(catalog,state));
   cached={catalog,visibility,prepared};
  }
  return sendPreparedJSON(req,res,cached.prepared);
 };
}
