import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
globalThis.indexedDB={open:()=>({})};
const {checkoutArtworkIssue,epsCheckoutMessage}=await import('../dist/checkout-artwork-readiness.mjs');
const {translate}=await import('../dist/i18n-core.mjs');
const eps={id:'eps',name:'original.eps',type:'application/postscript'},pdf={id:'pdf',name:'original.pdf',type:'application/pdf'};
const line=logos=>({id:'line',productId:'product',sku:'sku',quantity:1,decorations:[{optionId:'front',artworks:logos.map(logo=>({logo})),text:'Privat ÆØÅ'}]});
const png=new Blob(['PNG'],{type:'image/png'});
test('missing EPS preview blocks mixed designs in either order without changing original design data',async()=>{
 for(const logos of [[eps,pdf],[pdf,eps]]){const lines=[line(logos)],before=structuredClone(lines);assert.equal(await checkoutArtworkIssue(lines,{loadPreview:async()=>null}),epsCheckoutMessage);assert.deepEqual(lines,before);}
});
test('EPS with a real preview is allowed; preview failures and missing originals fail closed',async()=>{
 assert.equal(await checkoutArtworkIssue([line([eps])],{loadPreview:async()=>png}),null);
 for(const loadPreview of [async()=>null,async()=>{throw Error('original unavailable');}])assert.equal(await checkoutArtworkIssue([line([eps])],{loadPreview}),epsCheckoutMessage);
});
test('legacy EPS, uppercase names and duplicate logos are checked without replacing saved company mockups',async()=>{
 assert.equal(await checkoutArtworkIssue([{decorations:[{logo:{id:'legacy',name:'LOGO.EPS'}}]}],{loadPreview:async()=>null}),epsCheckoutMessage);
 let calls=0;assert.equal(await checkoutArtworkIssue([line([eps,eps]),line([eps])],{loadPreview:async()=>{calls++;return png;}}),null);assert.equal(calls,1);
 assert.equal(await checkoutArtworkIssue([{...line([eps]),companyTemplate:{id:'saved'}}],{loadPreview:async()=>{throw Error('must use server mockup');}}),null);
});
test('PDF, AI, text-only and blank designs retain their existing checkout validation',async()=>{
 const lines=[line([pdf,{id:'ai',name:'original.ai',type:'application/illustrator'}]),line([]),{decorations:[]}];
 assert.equal(await checkoutArtworkIssue(lines,{loadPreview:async()=>{throw Error('unrelated preview conversion');}}),null);
});
test('a missing preview is checked again after recovery and preview metadata is not conflated',async()=>{
 let recovered=false;const loadPreview=async logo=>recovered||logo.previewId==='real'?png:null;
 assert.equal(await checkoutArtworkIssue([line([eps])],{loadPreview}),epsCheckoutMessage);recovered=true;
 assert.equal(await checkoutArtworkIssue([line([eps])],{loadPreview}),null);
 assert.equal(await checkoutArtworkIssue([line([{...eps,previewId:'real'},eps])],{loadPreview:async logo=>logo.previewId?png:null}),epsCheckoutMessage);
});
test('the full actionable EPS message is available in Danish and English',()=>{
 assert.match(epsCheckoutMessage,/PDF-kompatibel AI-fil/);assert.match(epsCheckoutMessage,/originalfil er bevaret/);
 assert.match(translate(epsCheckoutMessage,'en'),/^An EPS file has no preview\./);assert.match(translate(epsCheckoutMessage,'en'),/manual artwork review/);assert.match(translate(epsCheckoutMessage,'en'),/original file have been kept/);
});

const checkoutSource=(await readFile(new URL('../dist/checkout.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
const cartSource=(await readFile(new URL('../dist/pf-cart.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
const noop=()=>{};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function checkoutFixture(initial,{loadPreview=async()=>null}={}){
 let lines=initial;const requests=[],button={disabled:true},summary={append:noop},error={},notice={hidden:true,querySelector:()=>notice.message},field=()=>({addEventListener:noop});notice.message={};
 const next={disabled:true},methodNext={disabled:true},back={},heading={focus:noop},payment={hidden:true},review={hidden:true},details={hidden:false};
 const paymentMethod={...field(),value:'',selectedOptions:[{textContent:'Betal online'}],reportValidity(){return !!this.value;},checkValidity(){return !!this.value;}};
 const progress=['details','payment','review'].map(checkoutProgress=>({dataset:{checkoutProgress},setAttribute:noop,removeAttribute:noop,classList:{toggle:noop}}));
 const section={querySelector:()=>heading,querySelectorAll:selector=>selector==='[data-checkout-progress]'?progress:[payment]};
 const controls={'button[type=submit]':button,'[data-checkout-next]':next,'[data-checkout-method-next]':methodNext,'[data-checkout-back]':back,'.checkout-business-terms':{},'#checkout-payment-help':{},'[data-checkout-selected-method]':{},'#bank-prepayment-consent':{}};
 const form={dataset:{adminTest:'false'},isConnected:true,elements:{customerType:field(),differentBillingAddress:field(),paymentMethod,bankPrepaymentAccepted:{}},querySelector:selector=>controls[selector],closest:()=>section,querySelectorAll:selector=>selector.includes(':is(')?[]:selector==='[data-checkout-review-step]'?[review]:selector.includes('[data-checkout-details]')?[details]:[],reportValidity:()=>true};
 const nodes={'#pf-checkout-form':form,'#pf-checkout-summary':summary,'#pf-checkout-error':error,'#pf-checkout-artwork-notice':notice,'#checkout-business':{}};
 const context=vm.createContext({URLSearchParams,location:{search:''},document:{querySelector:selector=>nodes[selector],contains:()=>true,createElement:()=>({append:noop})},window:{addEventListener:noop},readCart:()=>lines,checkoutArtworkIssue:lines=>checkoutArtworkIssue(lines,{loadPreview}),bindAddressPicker:noop,syncBillingFields:noop,customerType:()=> 'business',setCustomerType:noop,fetchQuote:async()=>({net:100,vat:25,totalIncVat:125}),get:async url=>{requests.push(url);return {ready:true,deliveryTerms:{da:'LOCAL'}};},fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({ready:true,deliveryTerms:{da:'LOCAL'}})};},freightEstimate:()=>({exVat:100,incVat:125}),getLanguage:()=> 'da',vatLabel:()=> 'ekskl. moms',kroner:String,quoteAmount:q=>q.net,fromInc:(inc,ex)=>ex});
 vm.runInContext(checkoutSource+';globalThis.bind=bindCheckout;',context);
 return {form,button,next,methodNext,back,payment,review,details,summary,error,notice,requests,start:()=>context.bind(),setLines:value=>{lines=value;}};
}
test('direct checkout blocks EPS before any quote/payment requests and prevents native form submission during checks',async()=>{
 const gate=deferred(),fixture=checkoutFixture([line([eps])],{loadPreview:async()=>{await gate.promise;return null;}}),binding=fixture.start();
 let prevented=false;fixture.form.onsubmit({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(fixture.button.disabled,true);
 gate.resolve();await binding;assert.equal(fixture.notice.hidden,false);assert.equal(fixture.notice.message.textContent,epsCheckoutMessage);assert.equal(fixture.requests.length,0);assert.equal(fixture.button.disabled,true);assert.equal(fixture.summary.textContent,'Onlinebestilling er sat på pause.');
});
test('checkout rechecks a changed cart at submit and sends no payment session for new EPS without preview',async()=>{
 const fixture=checkoutFixture([line([pdf])]);await fixture.start();assert.equal(fixture.next.disabled,false,fixture.error.textContent);
 assert.equal(fixture.button.disabled,true);
 const before=fixture.requests.length;
 fixture.next.onclick();assert.equal(fixture.requests.length,before);assert.equal(fixture.button.disabled,true);
 assert.equal(fixture.payment.hidden,false);assert.equal(fixture.details.hidden,true);
 fixture.methodNext.onclick();assert.equal(fixture.review.hidden,true);
 fixture.form.elements.paymentMethod.value='card';
 fixture.methodNext.onclick();assert.equal(fixture.review.hidden,false);assert.equal(fixture.button.disabled,false);
 assert.equal(fixture.requests.length,before);
 fixture.back.onclick();assert.equal(fixture.payment.hidden,false);assert.equal(fixture.review.hidden,true);
 fixture.back.onclick();assert.equal(fixture.payment.hidden,true);assert.equal(fixture.details.hidden,false);
 fixture.next.onclick();fixture.methodNext.onclick();fixture.setLines([line([eps])]);await fixture.form.onsubmit({preventDefault:noop});
 assert.equal(fixture.error.textContent,epsCheckoutMessage);assert.equal(fixture.requests.length,before);assert.ok(!fixture.requests.some(url=>url.includes('/session')));
});

function cartFixture(initial,{loadPreview=async()=>null,priceFailure=false}={}){
 const values=new Map([['pf-cart-v1',JSON.stringify(initial)]]),attributes=new Map(),link={setAttribute:(k,v)=>attributes.set(k,v),getAttribute:k=>attributes.get(k),removeAttribute:k=>attributes.delete(k)},notice={},total={},root={isConnected:true},events={};
 const nodes={'.pf-cart-page':root,'#pf-cart-checkout-link':link,'#pf-cart-checkout-notice':notice,'#pf-cart-total':total};
 const context=vm.createContext({localStorage:{getItem:key=>values.get(key)},document:{querySelector:selector=>nodes[selector],querySelectorAll:()=>[]},window:{addEventListener:(name,fn)=>events[name]=fn,removeEventListener:noop},bindCartMockups:noop,checkoutArtworkIssue:lines=>checkoutArtworkIssue(lines,{loadPreview}),fetch:async url=>{if(url==='/api/pf-quote'){if(priceFailure)throw Error('offline price');return {ok:true,json:async()=>({totalIncVat:125,lines:[]})};}return {ok:true,json:async()=>({ready:true})};},readJSONResponse:r=>r.json(),freightEstimate:()=>null,customerType:()=> 'consumer'});
 vm.runInContext(cartSource+';cartOverviewHTML=()=>"PRICE";globalThis.bind=bindCart;',context);context.bind({},noop,noop);
 return {link,notice,total,events,setLines:lines=>values.set('pf-cart-v1',JSON.stringify(lines))};
}
async function settled(fixture){for(let i=0;i<20&&fixture.link.getAttribute('aria-disabled')==='true';i++)await new Promise(setImmediate);assert.notEqual(fixture.link.getAttribute('aria-disabled'),'true');}
test('cart blocks navigation during checking and routes an EPS issue to contact even if price lookup fails',async()=>{
 const gate=deferred(),fixture=cartFixture([line([eps])],{priceFailure:true,loadPreview:async()=>{await gate.promise;return null;}});
 let prevented=false;fixture.link.onclick({preventDefault(){prevented=true;}});assert.equal(prevented,true);
 gate.resolve();await settled(fixture);assert.equal(fixture.link.href,'/kontakt');assert.equal(fixture.notice.textContent,epsCheckoutMessage);assert.equal(fixture.total.textContent,'offline price');
});
test('a late result from an old cart cannot overwrite the current complete design',async()=>{
 const gate=deferred(),fixture=cartFixture([line([eps])],{loadPreview:async()=>{await gate.promise;return null;}});
 fixture.setLines([line([pdf])]);fixture.events['customer-pricing-change']();await settled(fixture);assert.equal(fixture.link.href,'/betaling');
 gate.resolve();await new Promise(setImmediate);assert.equal(fixture.link.href,'/betaling');assert.notEqual(fixture.notice.textContent,epsCheckoutMessage);
});
