const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');const root=process.cwd();if(fs.existsSync('evidence/browser.json'))throw Error('Existing browser evidence; do not resend completed transactions.');
(async()=>{
 const report={kind:'Real browser-signed Studionet transactions with explicit session accounts',transport:process.env.RPC_TEST_RELAY==='1'?'CA-verified real HTTPS RPC relay; no mocked responses':'Direct browser RPC',transactions:[],checks:[]};const save=()=>fs.writeFileSync('./evidence/browser.json',JSON.stringify(report,null,2));
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const p=await b.newPage({viewport:{width:1440,height:1100}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 if(process.env.RPC_TEST_RELAY==='1')await p.route('https://studio.genlayer.com/api',async route=>{try{const r=await fetch('https://studio.genlayer.com/api',{method:'POST',headers:{'content-type':'application/json'},body:route.request().postData()});await route.fulfill({status:r.status,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:await r.text()})}catch(e){console.log('relay error',e.message);await route.abort()}});
 await p.goto(process.env.APP_URL||'http://127.0.0.1:4173');await p.waitForFunction(()=>document.querySelector('#read-status').textContent.startsWith('Finalized'),null,{timeout:60000});report.checks.push('Finalized ledger read');save();
 async function makeSession(){await p.locator('#connect').click();await p.locator('#session-wallet').click();await p.waitForFunction(()=>!document.querySelector('#wallet-dialog').open);return (await p.locator('#notice').innerText()).match(/0x[0-9a-fA-F]{40}/)[0]}
 const owner=await makeSession(),custodian=await makeSession();report.owner=owner;report.custodian=custodian;save();
 async function choose(n){await p.locator('#connect').click();await p.locator('.wallet-option').nth(n).click();await p.waitForFunction(()=>!document.querySelector('#wallet-dialog').open)}
 await choose(0);
 const reference='browser-'+Date.now().toString(36);report.case_id=owner.toLowerCase()+':'+reference;save();
 for(const [name,value] of Object.entries({reference,number:'F-1170-2024',lot:'Browser acceptance declaration; 05/24',quantity:'7',custodian}))await p.locator(`#create-form [name="${name}"]`).fill(value);
 async function action(label,click){
  const prev=await p.locator('#tx-link').getAttribute('href');await click();
  await p.waitForFunction(prev=>{const a=document.querySelector('#tx-link');return a.textContent.startsWith('0x')&&a.getAttribute('href')!==prev},prev,{timeout:60000});
  const hash=(await p.locator('#tx-link').innerText()).trim();const item={label,hash};report.transactions.push(item);save();console.log(label,hash);
  await p.waitForFunction(()=>document.querySelector('#tx-stage').textContent==='FINALIZED + SUCCESS · state read back',null,{timeout:900000});
  await p.waitForFunction(()=>!document.querySelector('#create-form button').disabled,null,{timeout:60000});item.result=await p.locator('#tx-detail').innerText();save();console.log(item.result);
 }
 await action('browser-create',()=>p.locator('#create-form button').click());
 await p.locator(`[data-id="${report.case_id}"]`).click();
 await action('browser-verify-fda',()=>p.locator('#verify').click());
 await p.locator('#close-detail').click();await choose(1);await p.locator(`[data-id="${report.case_id}"]`).click();
 await p.locator('#propose-form [name="quantity"]').fill('7');await p.locator('#propose-form [name="evidence"]').fill('browser-acceptance-return-007');
 await action('browser-propose-return',()=>p.locator('#propose-form button').click());
 await p.locator('#close-detail').click();await choose(0);await p.locator(`[data-id="${report.case_id}"]`).click();
 await action('browser-confirm-return',()=>p.locator('#confirm').click());
 report.checks.push('Create, source verification, custodian proposal, coordinator confirmation via rendered UI');report.detail_text=await p.locator('#detail-content').innerText();
 await p.screenshot({path:'./evidence/browser-reconciled.png',fullPage:true});await p.locator('#close-detail').click();
 await p.screenshot({path:'./evidence/desktop.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'./evidence/mobile.png',fullPage:true});
 report.mobile_overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);report.page_errors=errors;report.completed_at=new Date().toISOString();save();console.log('BROWSER COMPLETE');await b.close();
})().catch(e=>{console.error(e);process.exitCode=1});
