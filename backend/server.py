"""Local-only reference server. Static app + strict consented fingerprint store."""
import argparse, json, os, re, secrets, sqlite3, time, urllib.request
from collections import defaultdict, deque
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock, Thread
from urllib.parse import urlsplit
from campaigns import discover
try:
    from radar.cluster import cluster_trajectories
    from radar.drift import StreamingRadarDriftDetector
    RADAR_DRIFT_DETECTOR=StreamingRadarDriftDetector()
    RADAR_AVAILABLE=True
except ImportError:
    RADAR_AVAILABLE=False
    cluster_trajectories=lambda reports: {'clusters':[], 'novel_campaigns':[], 'noise_count':len(reports), 'total_evaluated':0}
    RADAR_DRIFT_DETECTOR=None

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
SUPPORTED_VERSIONS={'0.1.0','0.2.0','0.3.0',VERSION}
TACTICS={'authority','urgency','threat','isolation','credentials','remote_access','investment','refund','fee','payment','apk','verification','link_risk'}
CHANNELS={'message','call','link','qr','payment'}
BUCKETS={'unknown','under_1k','1k_10k','10k_50k','50k_plus'}
LOCK=Lock(); LIMITS=defaultdict(deque)

def validate(p):
    base_keys={'version','session_id','tactics','channels','sequence','amount_bucket','event_count'}
    allowed_keys=base_keys | {'trajectory'}
    if not isinstance(p,dict) or not (base_keys <= set(p) <= allowed_keys): raise ValueError('Only the documented fingerprint fields are accepted')
    if not isinstance(p['version'],str) or p['version'] not in SUPPORTED_VERSIONS or not isinstance(p['session_id'],str) or not re.fullmatch(r'[a-zA-Z0-9-]{8,64}',p['session_id']): raise ValueError('Invalid version or session ID')
    for key,allowed,maximum in [('tactics',TACTICS,13),('channels',CHANNELS,5),('sequence',TACTICS,64)]:
        if not isinstance(p[key],list) or len(p[key])>maximum or any(not isinstance(x,str) or x not in allowed for x in p[key]): raise ValueError('Invalid enum array')
    if len(p['tactics']) != len(set(p['tactics'])) or len(p['channels']) != len(set(p['channels'])): raise ValueError('Duplicate enum entries')
    if not isinstance(p['amount_bucket'],str) or p['amount_bucket'] not in BUCKETS or type(p['event_count'])!=int or not 1<=p['event_count']<=64: raise ValueError('Invalid metadata')
    if not p['tactics'] or not p['channels'] or not p['sequence'] or set(p['sequence'])!=set(p['tactics']): raise ValueError('Inconsistent workflow fingerprint')
    if 'trajectory' in p:
        if not isinstance(p['trajectory'],list) or len(p['trajectory'])!=64 or any(not isinstance(v,(int,float)) for v in p['trajectory']):
            raise ValueError('Invalid 64-d trajectory vector')
    return p

class Store:
    def __init__(self,path):
        self.path=str(path)
        with self.db() as c:
            c.execute('CREATE TABLE IF NOT EXISTS fingerprints(id TEXT PRIMARY KEY, created REAL, payload TEXT)')
            c.execute('CREATE TABLE IF NOT EXISTS reviews(signature TEXT PRIMARY KEY, status TEXT)')
    @contextmanager
    def db(self):
        connection=sqlite3.connect(self.path)
        try:
            with connection: yield connection
        finally:
            connection.close()
    def put(self,p):
        with LOCK,self.db() as c:
            c.execute('DELETE FROM fingerprints WHERE created < ?', (time.time()-86400,))
            if c.execute('SELECT COUNT(*) FROM fingerprints').fetchone()[0] >= 1000:
                raise ValueError('Local store is full; wait for expiry or delete reports')
            c.execute('INSERT OR IGNORE INTO fingerprints VALUES(?,?,?)',(p['session_id'],time.time(),json.dumps(p)))
        if RADAR_AVAILABLE and RADAR_DRIFT_DETECTOR and 'trajectory' in p:
            RADAR_DRIFT_DETECTOR.observe_report(p, timestamp=time.time())
    def remove(self,id):
        with LOCK,self.db() as c:c.execute('DELETE FROM fingerprints WHERE id=?',(id,))
    def campaigns(self):
        with LOCK,self.db() as c:
            c.execute('DELETE FROM fingerprints WHERE created < ?', (time.time()-86400,))
            rows=c.execute('SELECT created,payload FROM fingerprints ORDER BY created').fetchall()
            reviews=dict(c.execute('SELECT signature,status FROM reviews'))
        return discover(rows, reviews, time.time())
    def review(self,signature,status):
        if signature not in {g['signature'] for g in self.campaigns()} or status not in {'reviewed','dismissed'}:raise ValueError('Invalid review')
        with LOCK,self.db() as c:c.execute('INSERT OR REPLACE INTO reviews VALUES(?,?)',(signature,status))
    def radar(self):
        with LOCK,self.db() as c:
            c.execute('DELETE FROM fingerprints WHERE created < ?', (time.time()-86400,))
            rows=c.execute('SELECT created,payload FROM fingerprints ORDER BY created').fetchall()
        reports=[]
        for created,raw in rows:
            try:
                p=json.loads(raw); p['created']=created; reports.append(p)
            except Exception: pass
        if not RADAR_AVAILABLE:
            return {
                'radar_status':'fallback_only',
                'algorithm':'Rule-based grouping (Install numpy, scikit-learn, river for HDBSCAN Radar)',
                'clusters':[],
                'novel_campaigns':[],
                'drift_alerts':[],
                'total_reports':len(reports),
                'noise_reports':len(reports),
                'privacy_guarantee':{
                    'raw_messages_received':0,
                    'audio_bytes_received':0,
                    'phone_numbers_received':0,
                    'upi_ids_received':0
                }
            }
        clustered=cluster_trajectories(reports)
        return {
            'radar_status':'active',
            'algorithm':'HDBSCAN Density Clustering + River ADWIN on 64-d Trajectories',
            'clusters':clustered.get('clusters',[]),
            'novel_campaigns':clustered.get('novel_campaigns',[]),
            'drift_alerts':RADAR_DRIFT_DETECTOR.get_active_alerts() if RADAR_DRIFT_DETECTOR else [],
            'total_reports':len(reports),
            'noise_reports':clustered.get('noise_count',0),
            'privacy_guarantee':{
                'raw_messages_received':0,
                'audio_bytes_received':0,
                'phone_numbers_received':0,
                'upi_ids_received':0
            }
        }

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
    def log_message(self,*a): pass # Content and session IDs never enter access logs.
    def end_headers(self):
        if self.path=='/web/sw.js':self.send_header('Service-Worker-Allowed','/')
        self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'")
        self.send_header('Permissions-Policy','microphone=(), camera=(self), geolocation=()')
        self.send_header('Cache-Control','no-store' if self.path.startswith('/api/') else 'no-cache');super().end_headers()
    def respond(self,status,payload):
        data=json.dumps(payload).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();
        if self.command != 'HEAD':self.wfile.write(data)
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/api/health':return self.respond(200,{'status':'ok','mode':'local prototype','retention_hours':24})
        if path=='/api/campaigns':return self.respond(200,{'campaigns':self.server.store.campaigns()})
        if path=='/api/radar':return self.respond(200,self.server.store.radar())
        if path=='/api/config':return self.respond(200,{'version':VERSION,'external_analytics':bool(os.environ.get('POSTHOG_PROJECT_TOKEN'))})
        # '/' is the hackathon presentation site; '/app' is the user-facing app (also bundled in the Android WebView).
        if path=='/':self.path='/web/site/index.html'
        elif path=='/app':self.path='/web/index.html'
        elif not (path.startswith(('/web/','/core/','/simulator/','/evaluation/'))):return self.respond(404,{'error':'Not found'})
        target=(ROOT/self.path.split('?')[0].lstrip('/')).resolve()
        allowed=any(target.is_relative_to(ROOT/d) for d in ['web','core','simulator','evaluation'])
        if not allowed or not target.is_file():return self.respond(404,{'error':'Not found'})
        self.path='/'+target.relative_to(ROOT).as_posix();return super().do_HEAD() if self.command == 'HEAD' else super().do_GET()
    def do_HEAD(self):return self.do_GET()
    def do_POST(self):
        if self.headers.get('Origin') and self.headers['Origin'] not in {'http://'+self.headers.get('Host',''),'https://'+self.headers.get('Host','')}:return self.respond(403,{'error':'Cross-origin requests rejected'})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.respond(415,{'error':'JSON required'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=8192: return self.respond(413,{'error':'Payload too large or empty'})
            with LOCK:
                now=time.time();q=LIMITS[self.client_address[0]]
                while q and q[0]<now-60:q.popleft()
                if len(q)>=60:return self.respond(429,{'error':'Rate limited'})
                q.append(now)
            p=json.loads(self.rfile.read(length))
            if self.path=='/api/analytics':
                token=os.environ.get('POSTHOG_PROJECT_TOKEN')
                if not token:return self.respond(503,{'error':'Analytics not configured'})
                safe=validate_analytics(p)
                Thread(target=send_analytics,args=(token,safe),daemon=True).start()
                return self.respond(202,{'queued':True})
            if self.path=='/api/fingerprints':
                if not isinstance(p,dict) or set(p)!={'consent','fingerprint'} or p['consent'] is not True:raise ValueError('Explicit consent required')
                self.server.store.put(validate(p['fingerprint']));return self.respond(201,{'stored':True,'retention_hours':24})
            if self.path=='/api/review':
                token=os.environ.get('SCAMGUARD_REVIEW_TOKEN')
                if not token or not secrets.compare_digest(self.headers.get('Authorization',''),'Bearer '+token):return self.respond(403,{'error':'Analyst token required'})
                if not isinstance(p,dict) or set(p)!={'signature','status'}:raise ValueError('Invalid review fields')
                self.server.store.review(p['signature'],p['status']);return self.respond(200,{'updated':True})
            return self.respond(404,{'error':'Not found'})
        except (ValueError,TypeError,KeyError):return self.respond(400,{'error':'Invalid request; follow the documented schema'})
    def do_DELETE(self):
        # Opaque random session ID is the deletion capability; cannot enumerate stored IDs.
        origin=self.headers.get('Origin')
        if origin and origin not in {'http://'+self.headers.get('Host',''),'https://'+self.headers.get('Host','')}:return self.respond(403,{'error':'Cross-origin requests rejected'})
        id=self.path.removeprefix('/api/fingerprints/')
        if self.path.startswith('/api/fingerprints/') and re.fullmatch(r'[a-zA-Z0-9-]{8,64}',id):
            self.server.store.remove(id);return self.respond(200,{'deleted':True})
        return self.respond(404,{'error':'Not found'})

def validate_analytics(p):
    events={'scamguard_activated','check_completed','warning_shown','warning_suppressed','user_continued','user_cancelled_payment','user_reported_scam','false_positive_feedback'}
    values={'severity':{'quiet','watch','warning','high'},'stage':{'Normal','Pretext','Pressure','Sensitive action','Payment intent','Transfer prepared'},'latency_bucket':{'under_10ms','10_100ms','100ms_plus'},'channel':CHANNELS,'source':{'user_check','synthetic_scam','synthetic_benign'},'intervention':{'shown','suppressed','none'}}
    if not isinstance(p,dict) or set(p)!={'event','properties','consent','distinct_id'} or p['consent'] is not True:raise ValueError('Explicit analytics consent required')
    if not isinstance(p['event'],str) or p['event'] not in events or not isinstance(p['distinct_id'],str) or not re.fullmatch(r'[a-zA-Z0-9-]{8,64}',p['distinct_id']):raise ValueError('Invalid analytics identifiers')
    if not isinstance(p['properties'],dict):raise ValueError('Invalid analytics properties')
    for key,value in p['properties'].items():
        if key not in values or not isinstance(value,str) or value not in values[key]:raise ValueError('Only coarse enum properties allowed')
    return {'event':p['event'],'distinct_id':p['distinct_id'],'properties':{**p['properties'],'$process_person_profile':False,'$geoip_disable':True}}

def send_analytics(token,payload):
    host=os.environ.get('POSTHOG_HOST','https://us.i.posthog.com')
    if host not in {'https://us.i.posthog.com','https://eu.i.posthog.com'}:return
    request=urllib.request.Request(host+'/i/v0/e',data=json.dumps({'api_key':token,**payload}).encode(),headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=3):pass
    except Exception:pass # Optional best-effort transport; no sensitive logs, no retry backlog.

def make_server(port=8000,db=None,host='127.0.0.1'):
    server=None
    if port == 0:
        server=ThreadingHTTPServer((host,0),Handler)
    else:
        for p in range(port, port+100):
            try:
                server=ThreadingHTTPServer((host,p),Handler);break
            except OSError:
                continue
        if server is None:server=ThreadingHTTPServer((host,0),Handler)
    server.store=Store(db or ROOT/'backend/fingerprints.sqlite');return server
if __name__=='__main__':
    default_port=int(os.environ.get('PORT','8000'))
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=default_port);parser.add_argument('--host',default=os.environ.get('HOST','127.0.0.1'));parser.add_argument('--db');args=parser.parse_args()
    s=make_server(args.port,db=args.db,host=args.host);print(f'ScamGuard: http://{args.host}:{s.server_port}',flush=True)
    try:s.serve_forever()
    except KeyboardInterrupt:s.server_close()
