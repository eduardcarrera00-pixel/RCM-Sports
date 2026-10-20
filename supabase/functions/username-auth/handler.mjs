const allowedOrigins=new Set(['https://eduardcarrera00-pixel.github.io','https://aesportsclub.github.io','https://camsports.github.io','http://127.0.0.1:5500','http://localhost:5500']);
const reserved=/^(admin|administrator|administrador|moderator|moderador|support|soporte|system|sistema|aesports|ae_sports|root)$/;
const randomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export function makeHandler({url,serviceKey,anonKey,createClient}) {
 return async req=>{
 const started=Date.now(),origin=req.headers.get('origin');
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
 if(origin&&allowedOrigins.has(origin))headers['Access-Control-Allow-Origin']=origin;
 const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!allowedOrigins.has(origin))return respond({error:'Origen no permitido.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return respond({error:'Método no permitido.'},405);
 // Supabase's JWT gateway remains enabled. Password/code verification below
 // authenticates the user; the public anon JWT alone never authorizes an account.
 try{
  let text='',size=0;const reader=req.body?.getReader();if(!reader)return respond({error:'Solicitud inválida.'},400);
  const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return respond({error:'Solicitud demasiado grande.'},413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
  const body=JSON.parse(text),action=body.action,username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
  if(!['register','login','recover','code'].includes(action)||username.length>254||password.length>128)return respond({error:'Solicitud inválida.'},400);
  if(!/^[a-z0-9_]{3,30}$/.test(username)&&!(action!=='register'&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(username)))return respond({error:'Usa entre 3 y 30 letras, números o guion bajo.'},400);
  if((action==='register'||action==='recover')&&password.length<8)return respond({error:'Usa una contraseña de al menos 8 caracteres.'},400);
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const admin=createClient(url,serviceKey,options),client=createClient(url,anonKey,options);
  async function limit(bucket,max,seconds){const r=await admin.rpc('ae_auth_take_limit',{p_bucket:bucket,p_limit:max,p_seconds:seconds});if(r.error)throw Error('service');return r.data===true;}
  // Global and per-account bounds do not trust client-supplied IP headers.
  const key=await hash(username);
  if(!await limit('global',300,600)||!await limit('account:'+key,15,600))return respond({error:'Demasiados intentos. Espera unos minutos antes de volver a probar.'},429);
  if(action==='register'){
   if(reserved.test(username)||!await limit('registrations',20,3600))return respond({error:'No se pudo registrar ese usuario. Prueba otro nombre o inténtalo más tarde.'},400);
   const reservation=crypto.randomUUID(),email=crypto.randomUUID()+'@accounts.aesports.invalid',code=randomCode();
   await admin.from('ae_auth_accounts').delete().eq('username',username).is('user_id',null).lt('created_at',new Date(Date.now()-15*60*1000).toISOString());
   const hold=await admin.from('ae_auth_accounts').insert({username,email,reservation,recovery_hash:await hash(code)});
   if(hold.error)return respond({error:'No se pudo registrar ese usuario. Prueba otro nombre o inténtalo más tarde.'},400);
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username}});
   if(created.error||!created.data.user){await admin.from('ae_auth_accounts').delete().eq('username',username).eq('reservation',reservation).is('user_id',null);return respond({error:'No pudimos crear la cuenta. Revisa la contraseña e inténtalo de nuevo.'},400);}
   const saved=await admin.from('ae_auth_accounts').update({user_id:created.data.user.id}).eq('username',username).eq('reservation',reservation).select('user_id').single();
   if(saved.error){await admin.auth.admin.deleteUser(created.data.user.id);await admin.from('ae_auth_accounts').delete().eq('username',username).eq('reservation',reservation);throw Error('service');}
   const signed=await client.auth.signInWithPassword({email,password});
   // Even if automatic sign-in is rate limited, deliver the recovery code.
   return respond({session:signed.data.session||null,recovery_code:code,username,created:true});
  }
  let lookup=admin.from('ae_auth_accounts').select('*');lookup=username.includes('@')?lookup.eq('email',username):lookup.eq('username',username);
  const found=await lookup.maybeSingle();if(found.error)throw Error('service');const account=found.data;
  if(action==='recover'){
   const code=String(body.recovery_code||'').replace(/\s|-/g,'').toLowerCase();
   if(!/^[0-9a-f]{64}$/.test(code)||!account?.user_id)return respond({error:'Usuario o código de recuperación incorrectos.'},400);
   const token=crypto.randomUUID(),digest=await hash(code);
   const claim=await admin.from('ae_auth_accounts').update({recovery_hash:null,recovery_token:token}).eq('username',account.username).eq('recovery_hash',digest).is('recovery_token',null).select('user_id').maybeSingle();
   if(claim.error)throw Error('service');if(!claim.data)return respond({error:'Usuario o código de recuperación incorrectos.'},400);
   const changed=await admin.auth.admin.updateUserById(account.user_id,{password});
   if(changed.error){await admin.from('ae_auth_accounts').update({recovery_hash:digest,recovery_token:null}).eq('username',account.username).eq('recovery_token',token);return respond({error:'No se pudo cambiar la contraseña. Revisa sus requisitos y vuelve a intentarlo.'},400);}
   const next=randomCode();const saved=await admin.from('ae_auth_accounts').update({recovery_hash:await hash(next),recovery_token:null}).eq('username',account.username).eq('recovery_token',token).select('user_id').single();
   if(saved.error)return respond({error:'Contraseña actualizada. Inicia sesión y genera un nuevo código de recuperación.'},503);
   // Revoke old refresh sessions after proving the recovery secret.
   const signed=await client.auth.signInWithPassword({email:account.email,password});
   if(signed.data.session){const revoked=await admin.auth.admin.signOut(signed.data.session.access_token,'global');if(revoked.error)return respond({error:'Contraseña actualizada. Inicia sesión y genera un código de recuperación nuevo.'},503);}
   return respond({recovery_code:next,username:account.username,recovered:true});
  }
  const signed=await client.auth.signInWithPassword({email:account?.email||crypto.randomUUID()+'@accounts.aesports.invalid',password});
  if(signed.error||!signed.data.session||!account?.user_id||signed.data.user.id!==account.user_id)return respond({error:'Usuario o contraseña incorrectos.'},400);
  let recovery_code;
  if(action==='code'||(!account.recovery_hash&&!account.recovery_token)){
   const next=randomCode();let update=admin.from('ae_auth_accounts').update({recovery_hash:await hash(next),recovery_token:null}).eq('username',account.username);
   // A login must not overwrite a code concurrently minted by another login.
   if(action!=='code')update=update.is('recovery_hash',null).is('recovery_token',null);
   const saved=await update.select('user_id').maybeSingle();if(saved.error)throw Error('service');if(saved.data)recovery_code=next;
  }
  return respond({session:signed.data.session,recovery_code,username:account.username});
 }catch{return respond({error:'No pudimos completar la solicitud. Inténtalo de nuevo.'},503);}
 finally{const left=650-(Date.now()-started);if(left>0)await new Promise(resolve=>setTimeout(resolve,left));}
 };
}
