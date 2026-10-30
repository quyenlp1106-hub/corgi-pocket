import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('Offline shell installs every asset and serves navigation / modules from a GitHub project subpath',async()=>{
 const scope='https://example.github.io/corgi-pocket/',handlers={},files=new Map();let online=true,claimed=false;
 const cache={async addAll(paths){for(const p of paths){const local=p==='./'?'index.html':p.replace('./','');files.set(new URL(p,scope).href,new Response(await readFile(new URL('../docs/'+local,import.meta.url))));}},async match(req){return files.get(new URL(typeof req==='string'?req:req.url,scope).href)?.clone();},async put(req,res){files.set(req.url,res);}};
 const ctx={URL,Response,self:{registration:{scope},location:{origin:new URL(scope).origin},clients:{claim(){claimed=true;}},skipWaiting(){},addEventListener(n,fn){handlers[n]=fn;}},caches:{open:async()=>cache,keys:async()=>['corgi-pocket-shell-v1'],delete:async()=>{}},fetch:async req=>{if(!online)throw Error('offline');return new Response('network');}};
 vm.runInNewContext(await readFile(new URL('../docs/sw.js',import.meta.url),'utf8'),ctx);
 let work;handlers.install({waitUntil(p){work=p;}});await work;assert.equal(files.size,11);
 handlers.activate({waitUntil(p){work=p;}});await work;assert.equal(claimed,true);
 online=false;let response;
 handlers.fetch({request:{method:'GET',url:scope+'app.js',mode:'cors'},respondWith(p){response=p;}});assert.match(await(await response).text(),/moneyInput/);
 handlers.fetch({request:{method:'GET',url:scope+'?new',mode:'navigate'},respondWith(p){response=p;}});assert.match(await(await response).text(),/Corgi Pocket/);
 let intercepted=false;handlers.fetch({request:{method:'GET',url:'https://external.example/test'},respondWith(){intercepted=true;}});assert.equal(intercepted,false);
 const manifest=JSON.parse(await readFile(new URL('../docs/manifest.webmanifest',import.meta.url),'utf8'));assert.equal(manifest.start_url,'./');assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)await readFile(new URL('../docs/'+icon.src,import.meta.url));
});
