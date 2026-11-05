import {adminRequestOriginAllowed} from '../payment-origin.mjs';
import {accountingAccess,accountingOverview,readAccountingBasis,readAccountingDocument,reconcilePeriod} from './service.mjs';
import {salesCSV,salesPDF} from './sales-export.mjs';

const base='/api/admin/accounting';
const reportRoutes=['','/export','/sales-export','/sales-export.pdf'];
export async function accountingHTTP(req,res,url,{readJSON,json}){
 if(url.pathname!==base&&!url.pathname.startsWith(base+'/'))return false;
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Robots-Tag','noindex');
 const param=name=>url.searchParams.get(name),suffix=url.pathname.slice(base.length);
 const attachment=(name,type,bytes)=>res.writeHead(200,{
  'Content-Type':type,'Content-Disposition':`attachment; filename="${name}"`,'Content-Security-Policy':'sandbox'
 }).end(bytes);
 try{
  const actor=accountingAccess(req),period=param('period');
  const from=param('from'),to=param('to'),hasRange=from!==null||to!==null;
  if(hasRange&&(period!==null||!reportRoutes.includes(suffix))){
   json(res,400,{error:'Vælg enten en måned eller en periode til rapporten. Afstemning kræver en måned.'});
   return true;
  }
  if(req.method==='GET'&&reportRoutes.includes(suffix)){
   const data=await accountingOverview(hasRange?{from,to}:period,actor);
   if(!suffix)json(res,200,data);
   else{
    const {report}=data,name=report.period||report.from+'_til_'+report.to;
    if(suffix==='/sales-export')attachment(`smerch-omsaetning-${name}.csv`,'text/csv; charset=utf-8',salesCSV(report));
    else if(suffix==='/sales-export.pdf')attachment(`smerch-omsaetning-${name}.pdf`,'application/pdf',await salesPDF(report));
    else attachment(`smerch-regnskab-${name}.json`,'application/json; charset=utf-8',JSON.stringify({...report,purpose:'report',approvedForPosting:false},null,2));
   }
  }else if(req.method==='GET'&&suffix==='/basis'){
   const basis=readAccountingBasis(period,param('version'));
   attachment(`smerch-afstemt-${basis.period}-v${basis.reconciliation.version}.json`,'application/json; charset=utf-8',JSON.stringify(basis,null,2));
  }else if(req.method==='GET'&&suffix==='/document'){
   const document=await readAccountingDocument(param('order'),param('id'),param('digest'));
   attachment('smerch-bilag.'+document.format,({pdf:'application/pdf',txt:'text/plain; charset=utf-8',html:'text/html; charset=utf-8'})[document.format],document.bytes);
  }else if(req.method==='POST'&&suffix==='/reconcile'){
   if(!adminRequestOriginAllowed(req)){json(res,403,{error:'Ugyldig oprindelse.'});return true;}
   json(res,200,await reconcilePeriod(period,await readJSON(req,4096),actor));
  }else json(res,404,{error:'Regnskabshandlingen findes ikke.'});
 }catch(error){
  const status=error.status||500;
  if(status===500)console.error(JSON.stringify({event:'accounting_failure',code:'request_failed'}));
  json(res,status,{error:status===500?'Regnskabsdata kunne ikke behandles.':error.message});
 }
 return true;
}
