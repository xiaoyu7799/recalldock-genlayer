import {read,submit,waitFinal} from './chain.js';
import {discover,ensureNetwork,sessionWallet,listen} from './wallets.js';
import {CONTRACT,EXPLORER} from './config.js';
const $=s=>document.querySelector(s),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let wallet=null,providers=[],sessions=[],unlisten=()=>{},cases=[],total=0,offset=0,filter='all',selected=null,busy=false,lastTx=null;
let noticeTimer;
function notice(message,error=false){$('#notice').textContent=message;$('#notice').className=error?'error':'';$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,10000)}
function error(e){notice(e.message||String(e),true)}
function walletLabel(){ $('#connect').textContent=wallet?`${wallet.name.startsWith('Testnet')?'Session':wallet.name} · ${wallet.address.slice(0,6)}…${wallet.address.slice(-4)}`:'Connect wallet →';renderWallets();renderCases();if(selected)renderDetail();}
function clearWallet(message){unlisten();wallet=null;walletLabel();if(message)notice(message,true)}
async function connect(entry){
 try{
  unlisten();wallet=null;
  const accounts=await entry.provider.request({method:'eth_requestAccounts'});
  if(!/^0x[0-9a-fA-F]{40}$/.test(accounts?.[0]||''))throw Error('Wallet did not return a valid account');
  await ensureNetwork(entry.provider);
  wallet={...entry,address:accounts[0]};unlisten=listen(entry.provider,clearWallet);walletLabel();$('#wallet-dialog').close();notice(`Connected ${entry.name}: ${accounts[0]}`);
 }catch(e){clearWallet();error(e)}
}
function renderWallets(){
 const list=$('#wallet-list');list.replaceChildren();
 for(const entry of [...providers,...sessions]){
  const b=document.createElement('button');b.className='wallet-option';
  if(typeof entry.icon==='string'&&/^data:image\/(png|jpeg|webp|svg\+xml);/.test(entry.icon)&&entry.icon.length<150000){const img=document.createElement('img');img.src=entry.icon;img.alt='';b.append(img)}
  const span=document.createElement('span');span.textContent=entry.name;b.append(span);const status=document.createElement('small');status.textContent=wallet?.id===entry.id?'CONNECTED':entry.address?entry.address.slice(0,8)+'…'+entry.address.slice(-4):'Connect →';b.append(status);b.onclick=()=>connect(entry);list.append(b);
 }
 if(!providers.length){const p=document.createElement('p');p.textContent='No browser wallet discovered. Open this site inside your mobile wallet or enable an EIP-6963 / EIP-1193 extension.';list.prepend(p)}
 $('#disconnect').disabled=!wallet;
}
function renderCases(){
 let shown=cases;if(filter==='mine')shown=shown.filter(x=>wallet&&[x.owner,x.custodian].includes(wallet.address.toLowerCase()));if(filter==='open')shown=shown.filter(x=>!['RECONCILED','CANCELLED'].includes(x.state));
 $('#metric-total').textContent=cases.length;$('#metric-open').textContent=cases.filter(x=>!['RECONCILED','CANCELLED'].includes(x.state)).length;$('#metric-resolved').textContent=cases.filter(x=>x.state==='RECONCILED').length;
 $('#cases').innerHTML=shown.length?shown.map(c=>`<article class="case-card" tabindex="0" role="button" data-id="${esc(c.id)}" aria-label="Open ${esc(c.reference)}"><div class="card-top"><h3>${esc(c.reference)}</h3><span class="badge ${esc(c.state)}">${esc(c.state.replaceAll('_',' '))}</span></div><p class="card-meta">${esc(c.recall_number)} · ${esc(c.lot)}<br>${c.source?esc(c.source.classification)+' · '+esc(c.source.recalling_firm):'Official source not yet verified'}</p><div class="card-bottom"><span><b>${esc(c.remaining)}</b> / ${esc(c.quantity)} units remain</span><span>View response →</span></div><div class="progress"><i style="width:${Math.floor(c.resolved/c.quantity*100)}%"></i></div></article>`).join(''):`<div class="empty"><b>${filter==='mine'&&!wallet?'Connect to find your cases':'Nothing in this view yet'}</b>${filter==='all'?'Create a response to start a shared record.':'Choose another filter or load another page.'}</div>`;
 $('#page').textContent=`Page ${offset/20+1} · ${total} total`;$('#prev').disabled=offset===0||busy;$('#next').disabled=offset+20>=total||busy;
 for(const el of document.querySelectorAll('.case-card')){const open=()=>{selected=cases.find(c=>c.id===el.dataset.id);renderDetail();$('#detail-dialog').showModal()};el.onclick=open;el.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();open()}}}
}
async function refresh(){
 $('#refresh').disabled=true;
 try{const data=await read('list_cases',[offset,20]);cases=data.cases;total=data.total;$('#read-status').textContent=`Finalized snapshot · ${new Date().toLocaleTimeString()} · metrics for this page`;if(selected){const current=await read('get_case',[selected.id]);selected=current}renderCases();if(selected)renderDetail()}
 catch(e){$('#read-status').textContent='Read failed — refresh to retry';error(e)}finally{$('#refresh').disabled=false}
}
const facts=c=>`<div class="detail-grid"><div><small>COORDINATOR</small><span>${esc(c.owner)}</span></div><div><small>CUSTODIAN</small><span>${esc(c.custodian)}</span></div><div><small>DECLARED LOT</small><span>${esc(c.lot)}</span></div><div><small>ACCOUNTING</small><span>${c.resolved} resolved + ${c.remaining} remaining = ${c.quantity}</span></div></div>`;
function renderDetail(){
 const c=selected,owner=wallet?.address.toLowerCase()===c.owner,custodian=wallet?.address.toLowerCase()===c.custodian;
 let action='';
 if(c.state==='UNVERIFIED')action=`<div class="action-box"><h3>Verify the official recall</h3><p>Independent validators retrieve FDA data. No match or disagreement leaves this case unverified.</p><div class="action-row"><button class="dark" id="verify">Verify with GenLayer →</button>${owner?'<button id="cancel-case">Cancel case</button>':''}</div></div>`;
 if(c.state==='QUARANTINED')action=custodian?`<form id="propose-form" class="action-box"><h3>Propose a disposition</h3><label>Action<select name="action"><option value="RETURN">Return to supplier</option><option value="DESTROY">Destroy inventory</option></select></label><label>Units<input name="quantity" type="number" min="1" max="${c.remaining}" step="1" required></label><label>Handling receipt reference<input name="evidence" minlength="3" maxlength="240" required placeholder="Receipt ID or public evidence URL"></label><p>Do not upload personal information. This is a declaration requiring coordinator confirmation.</p><button class="dark wide">Propose for sign-off →</button></form>`:'<div class="action-box"><h3>Waiting for the custodian</h3><p>The designated custodian must propose a return or destruction. Inventory stays quarantined.</p></div>';
 if(c.proposal)action=`<div class="action-box"><h3>Disposition #${c.proposal.revision}</h3><p>${esc(c.proposal.action)} · ${c.proposal.quantity} units<br>Receipt: ${esc(c.proposal.evidence_ref)}</p>${owner?'<div class="action-row"><button class="dark" id="confirm">Confirm handling</button><button id="reject">Reject proposal</button></div>':'<p>Waiting for the coordinator’s independent sign-off.</p>'}</div>`;
 if(c.state==='RECONCILED')action='<div class="action-box"><h3>All declared units reconciled ✓</h3><p>Both parties confirmed handling for the entire declared quantity. This is not proof of physical destruction or product safety.</p></div>';
 $('#detail-content').innerHTML=`<span class="badge ${esc(c.state)}">${esc(c.state)}</span><h3>${esc(c.reference)}</h3><p>${esc(c.id)}</p>${facts(c)}${c.source?`<div class="source-box"><div class="eyebrow">CONSENSUS-VERIFIED FDA RECORD</div><h3>${esc(c.source.recall_number)} · ${esc(c.source.classification)}</h3><p>${esc(c.source.recalling_firm)}<br>${esc(c.source.product_description)}</p><p><strong>Reason</strong><br>${esc(c.source.reason_for_recall)}</p><p><strong>Affected codes</strong><br>${esc(c.source.code_info||'Not provided by source')}</p><p>FDA status: ${esc(c.source.status)}<br>Dataset publication: ${esc(c.source.dataset_updated)}<br>This is a verification snapshot, not continuous monitoring.</p><a href="${esc(c.source.source_url)}" target="_blank" rel="noreferrer">Inspect official API record →</a><p>The declared lot match has not been independently verified. Compare the codes before handling.</p></div>`:''}${action}<h3>Disposition history</h3>${c.history.length?c.history.map(h=>`<div class="history-entry">#${h.revision} · ${esc(h.action)} · ${h.quantity} units · ${h.accepted?'CONFIRMED':'REJECTED'}<br>${esc(h.evidence_ref)}</div>`).join(''):'<p>No confirmed or rejected dispositions yet.</p>'}<p><a href="${EXPLORER}/address/${CONTRACT}" target="_blank" rel="noreferrer">View contract →</a></p>`;
 if($('#verify'))$('#verify').onclick=()=>run('Verify FDA recall','verify_recall',[c.id],c.id);
 if($('#cancel-case'))$('#cancel-case').onclick=()=>run('Cancel unverified case','cancel_case',[c.id],c.id);
 if($('#propose-form'))$('#propose-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);run('Propose disposition','propose_disposition',[c.id,f.get('action'),Number(f.get('quantity')),f.get('evidence')],c.id)};
 if($('#confirm'))$('#confirm').onclick=()=>run('Confirm disposition','confirm_disposition',[c.id,c.revision,true],c.id);
 if($('#reject'))$('#reject').onclick=()=>run('Reject disposition','confirm_disposition',[c.id,c.revision,false],c.id);
 for(const b of $('#detail-content').querySelectorAll('button'))b.disabled=busy;
}
function txStage(stage,detail){$('#tx-tray').hidden=false;$('#tx-stage').textContent=stage;$('#tx-detail').textContent=detail}
async function track(record){
 txStage('Waiting for finality','ACCEPTED is provisional. Only FINALIZED + SUCCESS completes this action.');
 $('#tx-link').textContent=record.hash;$('#tx-link').href=EXPLORER+'/tx/'+record.hash;
 await waitFinal(record.hash,status=>txStage(`Chain status: ${status}`,'Waiting for FINALIZED + SUCCESS; do not submit this action again.'));
 txStage('FINALIZED + SUCCESS','Reading finalized contract state…');
 const result=await read('get_case',[record.caseId]);
 txStage('FINALIZED + SUCCESS · state read back',`${record.label} · ${result.state} · ${result.resolved} resolved / ${result.quantity} declared units`);
 record.complete=true;localStorage.setItem('recalldock-last-tx',JSON.stringify(record));selected=result;
 await refresh();notice('Finalized successfully. Contract state read back.');
}
async function run(label,method,args,caseId){
 if(busy){notice('A transaction is already being tracked.');return}if(!wallet){$('#wallet-dialog').showModal();return}
 busy=true;$('#create-form button').disabled=true;if(selected)renderDetail();
 try{
  txStage('Awaiting signature',`${label} · ${wallet.name} · ${wallet.address}`);
  $('#tx-link').textContent='';
  const hash=await submit(wallet,method,args,()=>wallet);
  if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw Error('Wallet did not return a valid transaction hash');
  lastTx={hash,label,caseId,complete:false};localStorage.setItem('recalldock-last-tx',JSON.stringify(lastTx));
  await track(lastTx);
 }catch(e){txStage('Action needs attention',`${e.message} If a hash exists, resume tracking before retrying.`);error(e)}
 finally{busy=false;$('#create-form button').disabled=false;if(selected)renderDetail()}
}
$('#create-form').onsubmit=e=>{e.preventDefault();if(!wallet){$('#wallet-dialog').showModal();return}const f=new FormData(e.target),ref=f.get('reference').trim();run('Create response','open_case',[ref,f.get('number').trim(),f.get('lot').trim(),Number(f.get('quantity')),f.get('custodian').trim()],wallet.address.toLowerCase()+':'+ref)};
$('#connect').onclick=()=>{$('#wallet-dialog').showModal();renderWallets()};$('#close-wallet').onclick=()=>$('#wallet-dialog').close();$('#close-detail').onclick=()=>$('#detail-dialog').close();
$('#session-wallet').onclick=()=>{const entry=sessionWallet();sessions.push(entry);connect(entry)};$('#disconnect').onclick=()=>{clearWallet();$('#wallet-dialog').close();notice('Disconnected locally. To revoke site permissions, use your wallet settings. Session accounts are lost on refresh.')};
$('#refresh').onclick=refresh;$('#prev').onclick=()=>{offset=Math.max(0,offset-20);refresh()};$('#next').onclick=()=>{offset+=20;refresh()};
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;for(const x of document.querySelectorAll('[data-filter]'))x.classList.toggle('active',x===b);renderCases()};
$('#resume-tx').onclick=async()=>{if(!lastTx||busy)return;busy=true;try{await track(lastTx)}catch(e){txStage('Tracking needs attention',e.message);error(e)}finally{busy=false}};
$('#contract-link').href=EXPLORER+'/address/'+CONTRACT;
try{lastTx=JSON.parse(localStorage.getItem('recalldock-last-tx'));if(lastTx&&!lastTx.complete){txStage('Unfinished transaction saved','Resume tracking to inspect the existing transaction.');$('#tx-link').textContent=lastTx.hash;$('#tx-link').href=EXPLORER+'/tx/'+lastTx.hash}}catch{}
discover(list=>{providers=list;renderWallets()});renderWallets();refresh();
