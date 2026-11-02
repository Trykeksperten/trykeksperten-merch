// Keep requested products cheaply without retaining every decompressed shard.
// Concurrent misses share a shard read; at most two shards are decoded at once.
export function createCatalogDetailLoader(readShard,{shardFor,capacity=128,byteLimit=8*1024*1024,shardCapacity=6,concurrency=2}={}){
 for(const [value,max] of [[capacity,128],[byteLimit,8*1024*1024],[shardCapacity,6],[concurrency,2]])if(!Number.isInteger(value)||value<1||value>max)throw Error('Invalid catalogue cache limits.');
 const products=new Map(),shards=new Map(),pending=new Map(),waiting=[];let bytes=0,active=0;
 const touch=(map,key)=>{const value=map.get(key);map.delete(key);map.set(key,value);return value;};
 function begin(row){active++;(async()=>{
  try{const value=await readShard(row.key);if(!Array.isArray(value))throw Error('Invalid catalogue shard.');shards.set(row.key,value);while(shards.size>shardCapacity)shards.delete(shards.keys().next().value);row.resolve(value);}catch(error){row.reject(error);}
  finally{active--;pending.delete(row.key);const next=waiting.shift();if(next)begin(next);}
 })();}
 function shard(key){
  if(!/^\d{2}$/.test(key)||Number(key)>63)throw Error('Invalid catalogue shard.');
  if(shards.has(key))return Promise.resolve(touch(shards,key));if(pending.has(key))return pending.get(key);
  let row;const promise=new Promise((resolve,reject)=>{row={key,resolve,reject};});pending.set(key,promise);if(active<concurrency)begin(row);else waiting.push(row);return promise;
 }
 return async id=>{
  if(products.has(id))return touch(products,id).product;
  const product=(await shard(shardFor(id))).find(row=>row.id===id);if(!product)throw Error('Produktet findes ikke længere.');
  // Recheck after awaiting: concurrent callers must not count one entry twice.
  if(products.has(id))return touch(products,id).product;
  const size=Buffer.byteLength(JSON.stringify(product));
  if(size<=byteLimit){while(products.size&&(products.size>=capacity||bytes+size>byteLimit)){const key=products.keys().next().value;bytes-=products.get(key).size;products.delete(key);}products.set(id,{product,size});bytes+=size;}
  return product;
 };
}
