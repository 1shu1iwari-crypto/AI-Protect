import json, sys, tempfile, threading, unittest, urllib.request, urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from server import make_server, validate, validate_analytics, VERSION

def fingerprint(i='12345678-1111-4444-9999-123456789012'):
    return {'version':'0.1.0','session_id':i,'tactics':['authority','threat','payment'],'channels':['call','payment'],'sequence':['authority','threat','payment'],'amount_bucket':'10k_50k','event_count':3}
class API(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.server=make_server(0,Path(cls.tmp.name)/'test.sqlite');cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start();cls.url=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join();cls.tmp.cleanup()
    def request(self,path,body=None,method=None,headers=None):
        r=urllib.request.Request(self.url+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Content-Type':'application/json',**(headers or {})})
        try:
            with urllib.request.urlopen(r) as response:return response.status,json.loads(response.read())
        except urllib.error.HTTPError as e:
            try:return e.code,json.loads(e.read())
            finally:e.close()
    def test_consent_and_private_fields(self):
        p=fingerprint();self.assertEqual(self.request('/api/fingerprints',{'consent':False,'fingerprint':p})[0],400);p['raw_text']='private';self.assertEqual(self.request('/api/fingerprints',{'consent':True,'fingerprint':p})[0],400)
    def test_config_and_fingerprints_use_canonical_version(self):
        canonical=json.loads((Path(__file__).resolve().parents[1]/'package.json').read_text(encoding='utf-8'))['version']
        self.assertEqual(VERSION,canonical)
        self.assertEqual(self.request('/api/config')[1]['version'],canonical)
        p=fingerprint('version-check-12345678');p['version']=canonical
        self.assertEqual(self.request('/api/fingerprints',{'consent':True,'fingerprint':p})[0],201)
        self.assertEqual(self.request('/api/fingerprints/'+p['session_id'],method='DELETE')[0],200)
        for version in ['0.1.0','0.2.0','0.3.0']:
            p['version']=version;self.assertIs(validate(p),p)
    def test_deduplication_campaigns_and_deletion(self):
        for i in range(3):
            p=fingerprint(f'12345678-1111-4444-9999-{i:012d}')
            for _ in range(2):self.assertEqual(self.request('/api/fingerprints',{'consent':True,'fingerprint':p})[0],201)
        g=self.request('/api/campaigns')[1]['campaigns'];self.assertEqual(g[0]['reports'],3);self.assertEqual(g[0]['status'],'candidate');self.assertFalse(g[0]['trusted_reporters_verified'])
        self.assertEqual(self.request('/api/fingerprints/'+fingerprint('12345678-1111-4444-9999-000000000000')['session_id'],method='DELETE')[0],200)
        self.assertEqual(self.request('/api/campaigns')[1]['campaigns'],[])
    def test_cross_origin_and_analyst_gate(self):
        self.assertEqual(self.request('/api/fingerprints',{'consent':True,'fingerprint':fingerprint()},headers={'Origin':'https://malicious.invalid'})[0],403)
        self.assertEqual(self.request('/api/review',{'signature':'x','status':'reviewed'})[0],403)
    def test_private_server_files_are_not_served(self):
        for path in ['/backend/server.py','/backend/fingerprints.sqlite','/web/../backend/server.py','/.env']:
            self.assertEqual(self.request(path)[0],404,path)
    def test_static_root_and_modules_serve_directly_with_browser_mime_types(self):
        for path,mime,marker in [('/',{'text/html'},b'<!doctype html>'),('/app',{'text/html'},b'<!doctype html>'),('/web/app.mjs',{'text/javascript','application/javascript'},b'/core/review.mjs'),('/core/engine.mjs',{'text/javascript','application/javascript'},b'./version.mjs')]:
            for method in ['GET','HEAD']:
                with urllib.request.urlopen(urllib.request.Request(self.url+path,method=method)) as response:
                    self.assertEqual(response.status,200,path)
                    self.assertEqual(response.geturl(),self.url+path,path)
                    self.assertIn(response.headers.get_content_type(),mime,path)
                    self.assertGreater(int(response.headers['Content-Length']),0,path)
                    body=response.read()
                    if method=='GET':self.assertIn(marker,body,path)
                    else:self.assertEqual(body,b'',path)
    def test_invalid_schema_values_and_analytics(self):
        p=fingerprint();p['sequence']=['unstructured private text'];self.assertRaises(ValueError,validate,p)
        q={'consent':True,'distinct_id':'12345678-uuid','event':'warning_shown','properties':{'severity':'high'}};self.assertFalse(validate_analytics(q)['properties']['$process_person_profile']);q['properties']['raw_text']='secret';self.assertRaises(ValueError,validate_analytics,q)
    def test_head_cannot_bypass_the_static_allowlist(self):
        for path in ['/backend/server.py','/backend/fingerprints.sqlite','/.env']:
            r=urllib.request.Request(self.url+path,method='HEAD')
            with self.assertRaises(urllib.error.HTTPError) as response:urllib.request.urlopen(r)
            self.assertEqual(response.exception.code,404);response.exception.close()
    def test_audio_deepfake_analysis_endpoint(self):
        import base64
        # 1. Reject without explicit consent
        status, body = self.request('/api/audio/analyze', {'consent': False, 'audio_base64': 'AAAA'})
        self.assertEqual(status, 400)
        self.assertIn('error', body)

        # 2. Reject empty audio
        status, body = self.request('/api/audio/analyze', {'consent': True, 'audio_base64': ''})
        self.assertEqual(status, 400)
        self.assertIn('error', body)

        # 3. Analyze valid 16-bit PCM buffer (1.5 seconds)
        import numpy as np
        t = np.linspace(0, 1.5, 24000, dtype=np.float32)
        pcm = (0.3 * np.sin(2 * np.pi * 300 * t) * 32767).astype(np.int16).tobytes()
        b64_audio = base64.b64encode(pcm).decode('ascii')

        status, body = self.request('/api/audio/analyze', {'consent': True, 'audio_base64': b64_audio, 'sample_rate': 16000})
        self.assertEqual(status, 200)
        self.assertEqual(body['schema_version'], 1)
        self.assertEqual(body['analysis_status'], 'completed')
        self.assertEqual(body['media_type'], 'audio')
        self.assertIn(body['authenticity_assessment'], ['synthetic_suspected', 'no_strong_synthetic_indication', 'inconclusive'])
        self.assertIsInstance(body['raw_model_score'], float)
    def test_retention_expiry(self):
        with self.server.store.db() as c:c.execute('UPDATE fingerprints SET created=0')
        self.assertEqual(self.request('/api/campaigns')[1]['campaigns'],[])
if __name__=='__main__':unittest.main()
