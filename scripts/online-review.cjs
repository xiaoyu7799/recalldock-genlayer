// Online read-only browser acceptance. Never authorizes or broadcasts transactions.
const {chromium}=require('playwright');const fs=require('node:fs');const crypto=require('node:crypto');
let browser;
(async()=>{
 const url='https://xiaoyu7799.github.io/recalldock-genlayer/';
 const source=JSON.parse(fs.readFileSync('evidence/browser.json'));const tx=source.transactions.at(-1);
 const report={checked_at:new Date().toISOString(),url,transport:'CA-verified real HTTPS relay for cloud proxy compatibility; responses are not mocked. Browser direct TLS transport remains unverified.',resources:[],checks:[],page_errors:[],failed_requests:[],broadcasts:0,brand_wallets_tested:[]};
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const p=await browser.newPage({viewport:{width:1440,height:1100}});
 p.on('pageerror',e=>report.page_errors.push(e.message));p.on('requestfailed',r=>report.failed_requests.push({url:r.url(),error:r.failure()?.errorText}));
 await p.route('https://**/*',async route=>{
  const req=route.request();const target=req.url();
  if(!target.startsWith(url)&&target!=='https://studio.genlayer.com/api')throw Error('Unexpected request destination');
  if(target==='https://studio.genlayer.com/api'){
   const method=JSON.parse(req.postData()).method;
   if(!['gen_call','eth_chainId','eth_getTransactionByHash'].includes(method))throw Error('Read-only review blocked '+method);
  }
  const res=await fetch(target,{method:req.method(),headers:target.endsWith('/api')?{'content-type':'application/json'}:{},...(req.method()==='POST'?{body:req.postData()}:{}),signal:AbortSignal.timeout(45000)});
  const bytes=Buffer.from(await res.arrayBuffer());
  if(target.startsWith(url))report.resources.push({url:target,status:res.status,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  await route.fulfill({status:res.status,headers:{'content-type':res.headers.get('content-type')||'application/octet-stream','access-control-allow-origin':'*'},body:bytes});
 });
 await p.addInitScript(({hash,caseId})=>{
  localStorage.setItem('recalldock-last-tx',JSON.stringify({hash,caseId,label:'Online historical read-only review',complete:false}));
  const make=(name,addr)=>({name,request:async({method})=>{if(['eth_requestAccounts','eth_accounts'].includes(method))return[addr];if(method==='eth_chainId')return'0xf22f';throw Error('Protocol fixture forbids '+method);},on(){},removeListener(){}});
  const a=make('Protocol fixture A','0x'+'a'.repeat(40)),b=make('Protocol fixture B','0x'+'b'.repeat(40));
  window.addEventListener('eip6963:requestProvider',()=>{for(const [uuid,provider]of[['fixture-a',a],['fixture-b',b]])window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid,name:provider.name,icon:'',rdns:'test.protocol'},provider}}));});
 },{hash:tx.hash,caseId:source.case_id});
 const response=await p.goto(url);if(response.status()!==200)throw Error('Pages not 200');
 await p.waitForFunction(()=>document.querySelector('#read-status').textContent.startsWith('Finalized'),null,{timeout:60000});report.loaded_cases=await p.locator('.case-card').count();
 const chain=await p.evaluate(async()=>{const r=await fetch('https://studio.genlayer.com/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});return(await r.json()).result});
 if(BigInt(chain)!==61999n)throw Error('Wrong chain');report.chain_id=61999;
 await p.locator('a[href="#workspace"]').first().click();if(!p.url().endsWith('#workspace'))throw Error('Workspace navigation failed');
 report.checks.push('Published page renders, hash navigation works and live finalized ledger loads');
 await p.locator('#resume-tx').click();await p.waitForFunction(()=>document.querySelector('#tx-stage').textContent==='FINALIZED + SUCCESS · state read back',null,{timeout:60000});report.reused_transaction=tx.hash;report.readback=await p.locator('#tx-detail').innerText();if(!report.readback.includes('RECONCILED'))throw Error('Finalized record mismatch');
 report.checks.push('Existing successful transaction finalized and read back without resubmitting');
 for(const label of ['Protocol fixture A','Protocol fixture B']){
  await p.locator('#connect').click();const option=p.locator('.wallet-option').filter({hasText:label});if(await option.count()!==1)throw Error('Wallet discovery failed');await option.click();await p.waitForFunction(()=>!document.querySelector('#wallet-dialog').open);if(!(await p.locator('#connect').innerText()).includes(label))throw Error('Wrong provider selected');
 }
 report.checks.push('Two distinct EIP-6963 protocol fixtures discovered and selected through EIP-1193; not branded wallets');
 await p.locator('#connect').click();await p.locator('#disconnect').click();await p.locator('#connect').click();await p.locator('#session-wallet').click();await p.waitForFunction(()=>!document.querySelector('#wallet-dialog').open);if(!(await p.locator('#connect').innerText()).startsWith('Session'))throw Error('Session connection failed');await p.locator('#connect').click();await p.locator('#disconnect').click();
 report.checks.push('Explicit session account connects/disconnects without signing');
 report.widths={};for(const width of [320,360,390,768,1440]){await p.setViewportSize({width,height:900});const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Layout overflow');report.widths[width]={overflow:false};}
 await p.setViewportSize({width:1440,height:1100});await p.screenshot({path:'evidence/online-desktop.png',fullPage:true});await p.setViewportSize({width:390,height:844});await p.screenshot({path:'evidence/online-mobile.png',fullPage:true});
 await p.locator(`[data-id="${source.case_id}"]`).click();if(!(await p.locator('#detail-content').innerText()).includes('All declared units reconciled'))throw Error('Detail invalid');report.checks.push('Reconciled detail and FDA evidence render on mobile');
 for(const file of ['style.css','logo.svg','logo-512.png']){const r=await p.request.get(url+file).catch(()=>null);if(r&&r.status()===200)continue;await p.evaluate(async path=>{const r=await fetch(path);if(!r.ok)throw Error('Missing resource')},url+file);}
 if(report.page_errors.length||report.failed_requests.length)throw Error('Browser resource or JS error');
 for(const item of report.resources){if(item.status!==200)throw Error('Resource HTTP error');const relative=new URL(item.url).pathname.replace('/recalldock-genlayer/','')||'index.html';if(fs.existsSync('docs/'+relative)){const hash=crypto.createHash('sha256').update(fs.readFileSync('docs/'+relative)).digest('hex');if(item.sha256!==hash)throw Error('Published asset differs from local: '+relative);}}
 fs.writeFileSync('evidence/online-review.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report,null,2));
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1});
