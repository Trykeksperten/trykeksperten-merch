import test from 'node:test';
import assert from 'node:assert/strict';
import {readJSONResponse} from '../dist/api-response.mjs';

test('empty, HTML and malformed API responses produce a readable message',async()=>{
 for(const response of [new Response('',{status:403}),new Response('<html>Bad Gateway</html>',{status:502}),new Response(''),new Response('null')]){
  await assert.rejects(readJSONResponse(response,'Prøv igen om lidt.'),{message:'Prøv igen om lidt.'});
 }
});
test('API responses preserve validation errors and successful JSON',async()=>{
 await assert.rejects(readJSONResponse(new Response(JSON.stringify({error:'Logoet mangler.'}),{status:400}),'Prøv igen.'),{message:'Logoet mangler.'});
 assert.deepEqual(await readJSONResponse(new Response('{"status":"validated"}'),'Prøv igen.'),{status:'validated'});
});
