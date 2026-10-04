import {readFile,writeFile} from 'node:fs/promises';
const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Use a numeric semantic project version.');
const url=new URL('../core/version.mjs',import.meta.url),content=`// Generated from package.json by scripts/sync-version.mjs.\nexport const VERSION = '${version}';\n`;
if(await readFile(url,'utf8').catch(()=>null)!==content)await writeFile(url,content);
