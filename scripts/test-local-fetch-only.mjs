// Test preloader only. Does not alter the application or deployment environment.
const original=globalThis.fetch;
globalThis.fetch=(input,options)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Tests prohibit external fetch; inject a provider mock.');
 return original(input,options);
};
