import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Keep the developer commands usable on Windows and Unix without dependencies.
export function pythonCommand() {
 for (const command of process.platform==='win32'?['python','python3','py']:['python3','python']) {
  const probe=spawnSync(command,['-c','import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'],{stdio:'ignore'});
  if(!probe.error&&probe.status===0)return command;
 }
 throw Error('Python 3 is required. Install Python and add it to PATH.');
}
export function runPython(args) {
 const result=spawnSync(pythonCommand(),args,{stdio:'inherit'});
 if(result.error)throw result.error;
 return result.status??1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try{process.exitCode=runPython(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}
}
