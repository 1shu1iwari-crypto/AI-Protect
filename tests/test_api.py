import json, sys, tempfile, threading, unittest, urllib.request, urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from server import make_server, validate, validate_analytics

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
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
    def test_consent_and_private_fields(self):
        p=fingerprint();self.assertEqual(self.request('/api/fingerprints',{'consent':False,'fingerprint':p})[0],400);p['raw_text']='private';self.assertEqual(self.request('/api/fingerprints',{'consent':True,'fingerprint':p})[0],400)
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
    def test_invalid_schema_values_and_analytics(self):
        p=fingerprint();p['sequence']=['unstructured private text'];self.assertRaises(ValueError,validate,p)
        q={'consent':True,'distinct_id':'12345678-uuid','event':'warning_shown','properties':{'severity':'high'}};self.assertFalse(validate_analytics(q)['properties']['$process_person_profile']);q['properties']['raw_text']='secret';self.assertRaises(ValueError,validate_analytics,q)
    def test_retention_expiry(self):
        with self.server.store.db() as c:c.execute('UPDATE fingerprints SET created=0')
        self.assertEqual(self.request('/api/campaigns')[1]['campaigns'],[])
if __name__=='__main__':unittest.main()
