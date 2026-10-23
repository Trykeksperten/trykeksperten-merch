// Scope sandbox settings to an explicit admin test; never mutate production settings.
export function pfTestEnvironment(env=process.env){
 if(!['test','live'].includes(env.PF_GATEWAY_MODE))throw Error('PF Gateway er ikke aktiveret til test.');
 const password=env.PF_GATEWAY_TEST_PASSWORD||(env.PF_GATEWAY_MODE==='test'?env.PF_GATEWAY_PASSWORD:undefined);
 if(!password)throw Error('PF-testadgangskoden mangler. Tilføj PF_GATEWAY_TEST_PASSWORD på serveren.');
 return {...env,PF_GATEWAY_MODE:'test',PF_GATEWAY_LIVE_ENABLED:'0',PF_GATEWAY_TEST_PASSWORD:password,PF_GATEWAY_PASSWORD:password,PF_GATEWAY_PROD_PASSWORD:undefined,PF_AUTO_SUBMIT_ENABLED:'0'};
}
