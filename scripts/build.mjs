import {build} from 'esbuild';
import {mkdirSync,cpSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
mkdirSync('docs',{recursive:true});
cpSync('public','docs',{recursive:true});
await build({entryPoints:['src/app.js'],outfile:'docs/app.js',bundle:true,minify:true,format:'esm',target:'es2022'});
const hash=createHash('sha256').update(readFileSync('docs/app.js')).digest('hex').slice(0,12);
writeFileSync('docs/index.html',readFileSync('docs/index.html','utf8').replace('src="app.js"',`src="app.js?v=${hash}"`));
