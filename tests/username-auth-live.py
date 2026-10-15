# Explicit staging-only integration test. Credentials/codes stay in memory.
import os,json,secrets,urllib.request,urllib.error
key=os.environ['AE_STAGING_ANON_KEY'];base='https://vsejmawuvgwlijluuflp.supabase.co';created=[]
def req(path,data=None,token=None,method=None):
 headers={'apikey':key,'Authorization':'Bearer '+(token or key),'Content-Type':'application/json','Origin':'https://eduardcarrera00-pixel.github.io'}
 try:
  r=urllib.request.urlopen(urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers=headers,method=method),timeout=45)
  raw=r.read();return r.status,json.loads(raw) if raw else None
 except urllib.error.HTTPError as e:
  raw=e.read();return e.code,json.loads(raw) if raw else None

def auth(action,username,password,**kw):return req('/functions/v1/username-auth',dict(action=action,username=username,password=password,**kw))
try:
 names=['aecheck_'+secrets.token_hex(5) for _ in range(2)];pw=secrets.token_urlsafe(24)
 sessions=[];codes=[]
 for name in names:
  status,data=auth('register',name,pw);assert status==200,(status,data);assert data.get('session'),(status,{k:v for k,v in data.items() if k!='recovery_code'});created.append(data['session']['user']['id']);sessions.append(data['session']);codes.append(data['recovery_code'])
  assert len(data['recovery_code'])==64
 status,data=auth('login',names[0].upper(),pw);assert status==200 and data['session']['user']['id']==created[0]
 status,_=req('/auth/v1/logout',{},sessions[0]['access_token']);assert status in (200,204)
 status,data=auth('login',names[0],pw);assert status==200;sessions[0]=data['session']
 wrong=auth('login',names[0],'wrong-password')[1];unknown=auth('login','aecheck_missing_'+secrets.token_hex(3),'wrong-password')[1];assert wrong==unknown
 status,_=req('/rest/v1/ae_auth_accounts?select=username',token=sessions[0]['access_token']);assert status in (401,403)
 legs=[{'sport':'NFL','event':'Prueba A vs B','selection':'Gana A','odds':150}]
 status,_=req('/rest/v1/ae_community_picks',{'title':'Prueba temporal Auth','legs':legs},sessions[0]['access_token']);assert status==201,status
 status,rows=req('/rest/v1/ae_pick_feed?select=id&user_id=eq.'+created[0],token=sessions[0]['access_token']);pick=rows[0]['id']
 status,_=req('/rest/v1/ae_pick_votes',{'pick_id':pick,'value':1},sessions[1]['access_token']);assert status==201,status
 status,_=req('/rest/v1/ae_pick_comments',{'pick_id':pick,'body':'Comentario temporal Auth'},sessions[1]['access_token']);assert status==201,status
 newpw=secrets.token_urlsafe(24)
 status,_=auth('recover',names[0],newpw,recovery_code='0'*64);assert status==400,status
 status,data=auth('recover',names[0],newpw,recovery_code=codes[0]);assert status==200,(status,data);assert data['recovery_code']!=codes[0]
 status,_=auth('recover',names[0],newpw,recovery_code=codes[0]);assert status==400,status
 status,_=auth('login',names[0],pw);assert status==400,status
 status,_=auth('login',names[0],newpw);assert status==200,status
 print('PASS: staging registration, case-insensitive login, logout/login, generic errors, private identity access blocked, Pick/vote/comment persistence, single-use recovery, old password rejected.')
finally:
 print('CLEANUP_USER_IDS='+json.dumps(created))
