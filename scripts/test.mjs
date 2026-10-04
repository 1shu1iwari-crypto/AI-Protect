import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runPython} from './python.mjs';

const files=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name);
const js=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
if(js.error)throw js.error;
process.exitCode=js.status??1;
if(process.exitCode===0)process.exitCode=runPython(['-m','unittest','discover','-s','tests','-p','test_*.py']);
