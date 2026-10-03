'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),c=require('./core.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function state(dirs){const file=path.join(await c.stateDir(dirs.root),'shelf.json');return c.serialized(file,async()=>{let value=await c.readJson(file,null,2*1024*1024);if(!value){value={scope:crypto.randomBytes(24).toString('hex'),people:{},aliases:{}};await c.atomicJson(file,value);}return value;});}
async function decorate(dirs,data){
 const s=await state(dirs),visits=await c.readJson(path.join(await c.stateDir(dirs.root),'visits.json'),{}),positions=await c.readJson(path.join(await c.stateDir(dirs.root),'reading.json'),{});
 const chats=data.chats.map(x=>({...x,alias:s.aliases[x.id]||'',lastRead:Math.max(visits[x.id]||0,positions[x.id]?.updated||0)}));
 return {scope:s.scope,characters:data.characters.map(x=>{const own=chats.filter(y=>y.characterKey===x.key),p=s.people[x.key]||{};return {...x,favorite:p.favorite===true,cover:p.cover||'',lastRead:Math.max(0,...own.map(y=>y.lastRead)),modified:Math.max(0,...own.map(y=>y.modified))};}),chats};
}
async function change(dirs,body){
 const data=await c.catalog(dirs,{withCharacters:true});
 if(body.kind==='alias'){if(!data.chats.some(x=>x.id===body.id))throw c.fail(404,'현재 대화가 없어요.');if(typeof body.value!=='string'||body.value.length>100)throw c.fail(400,'별명은 100자 이내로 입력해 주세요.');}
 else if(body.kind==='favorite'){if(!data.characters.some(x=>x.key===body.key)||typeof body.value!=='boolean')throw c.fail(400,'캐릭터를 다시 선택해 주세요.');}
 else throw c.fail(400,'잘못된 책장 설정입니다.');
 await state(dirs);const file=path.join(await c.stateDir(dirs.root),'shelf.json');
 return c.serialized(file,async()=>{const s=await c.readJson(file,{},2*1024*1024);if(body.kind==='alias'){const v=body.value.trim();if(v)s.aliases[body.id]=v;else delete s.aliases[body.id];}else s.people[body.key]={...s.people[body.key],favorite:body.value};if(Buffer.byteLength(JSON.stringify(s))>2*1024*1024)throw c.fail(413,'책장 설정 용량을 넘었어요.');await c.atomicJson(file,s);return {ok:true};});
}
function cleanPng(raw){
 if(raw.length>512*1024||!raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw c.fail(415,'512KB 이하 PNG 표지만 지원해요.');
 const crc=b=>{let n=0xffffffff;for(const x of b){n^=x;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
 let at=8,width=0,height=0,channels=0,ended=false;const chunks=[raw.subarray(0,8)],compressed=[];
 while(at+12<=raw.length){const size=raw.readUInt32BE(at),end=at+12+size,type=raw.toString('ascii',at+4,at+8);if(end>raw.length||raw.readUInt32BE(end-4)!==crc(raw.subarray(at+4,end-4)))throw c.fail(415,'손상된 표지 파일이에요.');
  if(type==='IHDR'){if(at!==8||size!==13)throw c.fail(415,'잘못된 표지 형식이에요.');width=raw.readUInt32BE(at+8);height=raw.readUInt32BE(at+12);channels=raw[at+17]===6?4:raw[at+17]===2?3:0;if(!width||!height||width>640||height>640||raw[at+16]!==8||!channels||raw[at+18]||raw[at+19]||raw[at+20])throw c.fail(415,'표지를 작은 RGB PNG로 변환해 주세요.');}
  if(['IHDR','IDAT','IEND'].includes(type))chunks.push(raw.subarray(at,end));if(type==='IDAT')compressed.push(raw.subarray(at+8,end-4));at=end;if(type==='IEND'){if(size)throw c.fail(415,'잘못된 PNG예요.');ended=true;break;}
 }
 if(!ended||!channels||!compressed.length)throw c.fail(415,'표지를 읽지 못했어요.');
 let pixels;try{pixels=zlib.inflateSync(Buffer.concat(compressed),{maxOutputLength:2*1024*1024});}catch{throw c.fail(415,'표지를 읽지 못했어요.');}
 const stride=width*channels+1;if(pixels.length!==stride*height)throw c.fail(415,'표지 크기가 올바르지 않아요.');for(let y=0;y<height;y++)if(pixels[y*stride]>4)throw c.fail(415,'표지 픽셀이 올바르지 않아요.');return Buffer.concat(chunks);
}
async function cover(dirs,key,value){
 const data=await c.catalog(dirs,{withCharacters:true});if(typeof key!=='string'||!data.characters.some(x=>x.key===key))throw c.fail(404,'현재 캐릭터가 없어요.');
 const root=await c.stateDir(dirs.root),file=path.join(root,'cover-'+hash(key)+'.json');
 if(value===undefined){const v=await c.readJson(file,null,800000);if(!v)throw c.fail(404,'전용 표지가 없어요.');return Buffer.from(v.png,'base64');}
 let png=null;if(value!==null){if(typeof value!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)||value.length>710000)throw c.fail(415,'PNG 표지를 다시 선택해 주세요.');png=cleanPng(Buffer.from(value.split(',')[1],'base64'));}
 await state(dirs);const meta=path.join(root,'shelf.json');return c.serialized(meta,async()=>{const s=await c.readJson(meta,{},2*1024*1024),files=(await fs.readdir(root)).filter(n=>/^cover-[a-f0-9]{64}\.json$/.test(n));let total=0;for(const name of files)if(path.join(root,name)!==file)total+=(await fs.stat(path.join(root,name))).size;
  if(png&&total+png.length*1.34>32*1024*1024)throw c.fail(413,'표지 보관함 32MB 한도를 넘었어요. 사용하지 않는 표지를 지워 주세요.');
  if(png)await c.atomicJson(file,{png:png.toString('base64')});else await fs.rm(file,{force:true});s.people[key]={...s.people[key],cover:png?hash(png):''};await c.atomicJson(meta,s);return {ok:true};});
}
module.exports={state,decorate,change,cover,cleanPng};
