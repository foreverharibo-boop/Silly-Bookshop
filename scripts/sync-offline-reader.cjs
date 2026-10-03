'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
for(const [source,target] of [['web-reader.js','offline.js'],['web-reader.css','offline.css'],['web-reader.html','index.html']]){
 const input=fs.readFileSync(path.join(root,'server/public',source),'utf8'),content=source.endsWith('.html')?input.replaceAll('./web-reader.js','./offline.js').replaceAll('./web-reader.css','./offline.css'):input,file=path.join(root,'android/offline',target);
 if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==content)throw Error('Offline reader differs: '+target);}else fs.writeFileSync(file,content);
}
