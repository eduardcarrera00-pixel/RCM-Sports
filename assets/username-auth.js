/* Username/password UX. Credentials are verified by Supabase Auth on the server. */
// Public anon JWT for the Edge gateway; account access still requires password/code.
const authGatewayKey="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphaHVobXZtcXZ4YXVucWVicWFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNDQ1MTcsImV4cCI6MjEwNjcyMDUxN30.0tszsvlScd-IG4YoJ0LMs9F4J-q1ukiMTHeWFixom7o";
let authMode='login',authRecoveryNeedsLogin=false;
/* Only the latest publication request is retained, until completion or dismissal. */
let aePendingPublication=null,aePublicationRequest=0;
function aeClearPendingPublication(){
 aePublicationRequest++;
 aePendingPublication=null;
 const hint=document.getElementById('aeAuthPublishHint');
 if(hint){hint.hidden=true;hint.textContent='';}
}
function aeResumePendingPublication(){
 const next=aePendingPublication;
 aeClearPendingPublication();
 if(typeof next==='function')next();
}
async function aeRequestPublication(kind,continueToComposer){
 if(typeof continueToComposer!=='function')return;
 const request=++aePublicationRequest;
 try{
  if(!db?.auth?.getUser)throw Error('No se pudo conectar con AE SPORTS.');
  const result=await db.auth.getUser();
  if(request!==aePublicationRequest)return;
  if(result.error&&result.error.name!=='AuthSessionMissingError'&&result.error.code!=='session_not_found')throw result.error;
  if(result.data?.user){
   aeClearPendingPublication();
   continueToComposer();
   return;
  }
  aePendingPublication=continueToComposer;
  const hint=document.getElementById('aeAuthPublishHint');
  if(hint){
   hint.textContent='Para publicar tu '+(kind==='pick'?'Pick':'Take')+', inicia sesión o crea una cuenta. Después volverás directamente al formulario.';
   hint.hidden=false;
  }
  setAuthMode('login');
  openUserAuthModal();
 }catch(error){
  if(request!==aePublicationRequest)return;
  aeClearPendingPublication();
  window.alert(error.message||'No se pudo comprobar tu sesión. Inténtalo de nuevo.');
 }
}
/* El login es repetible, pero registrar y recuperar contraseñas NO: no se
   reintentan automáticamente para evitar cuentas o códigos duplicados. */
async function aeAuthRequest(payload){
 if(!db?.supabaseUrl||!db?.supabaseKey)throw Error('No se pudo inicializar la conexión con AE SPORTS. Recarga la página.');
 const endpoint=db.supabaseUrl+'/functions/v1/username-auth';
 const maxAttempts=payload.action==='login'?2:1;
 for(let attempt=0;attempt<maxAttempts;attempt++){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(endpoint,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':db.supabaseKey,'Authorization':'Bearer '+authGatewayKey},
    body:JSON.stringify(payload),
    signal:controller.signal
   });
   const result=await response.json().catch(()=>null);
   if(!response.ok)throw Error(result?.error||'El servicio de cuentas devolvió un error. Inténtalo de nuevo.');
   if(!result||typeof result!=='object')throw Error('Respuesta inválida del servicio de cuentas. Vuelve a intentarlo.');
   return result;
  }catch(error){
   const detail=String(error?.message||'');
   const timeout=error?.name==='AbortError';
   const network=timeout||/failed to fetch|networkerror|network request failed|load failed/i.test(detail);
   if(!network)throw error;
   if(attempt+1<maxAttempts)continue;
   throw Error(timeout
    ?'La conexión con el servicio de cuentas tardó demasiado. Inténtalo de nuevo.'
    :'No pudimos conectar con el servicio de cuentas. Comprueba tu conexión, recarga la página e inténtalo otra vez.');
  }finally{clearTimeout(timer);}
 }
 throw Error('No pudimos conectar con el servicio de cuentas.');
}
function setAuthMode(mode){
 authMode=mode;const extra=mode==='register'||mode==='recover';
 document.getElementById('authConfirmWrap').hidden=!extra;document.getElementById('authPasswordConfirm').required=extra;
 document.getElementById('authCodeWrap').hidden=mode!=='recover';document.getElementById('authRecoveryCode').required=mode==='recover';
 const password=document.getElementById('userAuthPassword');password.minLength=extra?8:1;password.maxLength=128;password.autocomplete=extra?'new-password':'current-password';
 document.getElementById('authSubmit').textContent={login:'Iniciar sesión',register:'Crear cuenta',recover:'Restablecer contraseña',code:'Generar código de recuperación'}[mode];
 document.getElementById('authModeHelp').textContent={login:'Inicia sesión con tu usuario. Las cuentas anteriores también pueden usar su correo.',register:'Usuario único y contraseña de al menos 8 caracteres. No necesitas correo. Al terminar, guarda tu código de recuperación.',recover:'Introduce tu usuario, una contraseña nueva y tu código de recuperación. El código se sustituirá por uno nuevo.',code:'Confirma tu usuario y contraseña actual. El código nuevo sustituirá al anterior.'}[mode];
 document.getElementById('userAuthError').classList.add('hidden');
}
function clearAuthSecrets(){for(const id of ['userAuthPassword','authPasswordConfirm','authRecoveryCode','authRecoveryOutput'])document.getElementById(id).value='';document.getElementById('userAuthForm').hidden=false;document.getElementById('authRecoveryResult').hidden=true;document.getElementById('userAuthPassword').type='password';document.getElementById('authShowPassword').textContent='Mostrar contraseña';setAuthMode('login');}
function toggleAuthPassword(){const p=document.getElementById('userAuthPassword');p.type=p.type==='password'?'text':'password';document.getElementById('authShowPassword').textContent=p.type==='password'?'Mostrar contraseña':'Ocultar contraseña';}
function handleUserRegister(){setAuthMode('register');}
async function handleUserLogin(event){
 event.preventDefault();if(authSubmitting)return;
 const username=normalizeUsername(document.getElementById('userAuthUsername').value),password=document.getElementById('userAuthPassword').value;
 if((authMode==='register'||authMode==='recover')&&password!==document.getElementById('authPasswordConfirm').value){showUserAuthError('Las contraseñas no coinciden.');return;}
 setAuthBusy(true);document.getElementById('userAuthError').classList.add('hidden');
 try{
  if(!db)throw Error('No se pudo conectar.');
  const result=await aeAuthRequest({action:authMode,username,password,recovery_code:document.getElementById('authRecoveryCode').value});
  let sessionError=false;
  if(result.session){const saved=await db.auth.setSession({access_token:result.session.access_token,refresh_token:result.session.refresh_token});if(saved.error)sessionError=true;else{currentUser={id:saved.data.user.id,username:result.username};await loadAdminSession();updateCommentAuthUI();}}
  if(result.recovery_code){authRecoveryNeedsLogin=!!result.recovered||!result.session||sessionError;document.getElementById('userAuthForm').hidden=true;document.getElementById('authRecoveryResult').hidden=false;document.getElementById('authRecoveryOutput').value=result.recovery_code;document.getElementById('authRecoveryMessage').textContent=result.recovered?'Contraseña actualizada. Guarda este código e inicia sesión.':authRecoveryNeedsLogin?'Cuenta preparada. Guarda este código y vuelve a iniciar sesión.':'Tu cuenta está lista y la sesión está abierta.';document.getElementById('authRecoveryOutput').focus();}
  else{if(sessionError)throw Error('No se pudo guardar la sesión. Vuelve a iniciar sesión.');closeUserAuthModal(true);}
  for(const id of ['userAuthPassword','authPasswordConfirm','authRecoveryCode'])document.getElementById(id).value='';
  if(activeModalArticleId){await loadCommentsFromSupabase(activeModalArticleId);refreshCommunity();}
 }catch(error){showUserAuthError(error.message||'No se pudo conectar. Inténtalo de nuevo.');}
 finally{setAuthBusy(false);}
}
async function copyRecoveryCode(){const input=document.getElementById('authRecoveryOutput');try{await navigator.clipboard.writeText(input.value);document.getElementById('authRecoveryMessage').textContent='Código copiado. Guárdalo en un lugar privado.';}catch{input.focus();input.select();document.getElementById('authRecoveryMessage').textContent='Copia el código seleccionado y guárdalo.';}}
function finishRecoveryCode(){const login=authRecoveryNeedsLogin;clearAuthSecrets();if(!login)closeUserAuthModal(true);else document.getElementById('userAuthUsername').focus();}
