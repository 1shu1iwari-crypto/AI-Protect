"""Download checksum-pinned Apache-2.0 Vosk models into generated assets."""
import hashlib, os, pathlib, shutil, sys, urllib.request, zipfile
out = pathlib.Path(sys.argv[1]); cache = pathlib.Path(os.environ.get('AIPROTECT_MODEL_CACHE', out.parent / 'model-downloads')); cache.mkdir(parents=True, exist_ok=True)
models = [('en','vosk-model-small-en-in-0.4','20663dcac4d5cb783a579c54d98339344a688e4ec6e1b4a4b059fd1235454cc7'),('hi','vosk-model-small-hi-0.22','7c50a10866889f0ac21d912c20537a055a597ed09fc1d3e5bcd798f9f0017e48')]
for lang, name, digest in models:
    archive=cache/(name+'.zip')
    if not archive.exists():
        with urllib.request.urlopen('https://alphacephei.com/vosk/models/'+name+'.zip', timeout=120) as response, archive.open('wb') as dst: shutil.copyfileobj(response,dst)
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=digest: raise RuntimeError('Model checksum mismatch: '+name)
    target=out/'models'/lang; shutil.rmtree(target,ignore_errors=True); target.mkdir(parents=True)
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            path=pathlib.PurePosixPath(info.filename)
            if path.is_absolute() or '..' in path.parts or path.parts[0]!=name: raise RuntimeError('Unsafe model path')
            rel=pathlib.Path(*path.parts[1:])
            if info.is_dir(): (target/rel).mkdir(parents=True,exist_ok=True)
            else:
                (target/rel).parent.mkdir(parents=True,exist_ok=True)
                with z.open(info) as src,(target/rel).open('wb') as dst: shutil.copyfileobj(src,dst)
    print('Prepared',name,flush=True)
