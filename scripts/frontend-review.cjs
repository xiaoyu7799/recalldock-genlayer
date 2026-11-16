// Read-only UI review. Existing transactions may be tracked; broadcasts are blocked.
const {chromium}=require('playwright');
const fs=require('node:fs');
let browser;
(async()=>{
 const historical=JSON.parse(fs.readFileSync('evidence/browser.json'));
 const tx=historical.transactions.at(-1);
 const report={checked_at:new Date().toISOString(),url:process.env.APP_URL||'http://127.0.0.1:4173',rpc_transport:process.env.RPC_TEST_RELAY==='1'?'CA-verified real HTTPS relay; no mocked RPC responses':'Direct browser HTTPS',broadcasts:0,checks:[],page_errors:[]};
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 browser=b;
 const p=await b.newPage({viewport:{width:1440,height:1100}});
 p.on('pageerror',e=>report.page_errors.push(e.message));
 await p.route('https://studio.genlayer.com/api',async route=>{
  const body=JSON.parse(route.request().postData());
  if(!['eth_chainId','gen_call','eth_getTransactionByHash','eth_getTransactionCount'].includes(body.method))throw Error('Read-only review blocked '+body.method);
  if(process.env.RPC_TEST_RELAY!=='1')return route.continue();
  const res=await fetch('https://studio.genlayer.com/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  await route.fulfill({status:res.status,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:await res.text()});
 });
 await p.addInitScript(({hash,caseId})=>localStorage.setItem('recalldock-last-tx',JSON.stringify({hash,caseId,label:'Read-only historical transaction review',complete:false})),{hash:tx.hash,caseId:historical.case_id});
 await p.goto(report.url);await p.waitForFunction(()=>document.querySelector('#read-status').textContent.startsWith('Finalized'),null,{timeout:60000});
 const cards=await p.locator('.case-card').count();if(cards<2)throw Error('Missing chain records');
 report.loaded_cases=cards;report.checks.push('Finalized live ledger read');
 await p.locator('#resume-tx').click();
 await p.waitForFunction(()=>document.querySelector('#tx-stage').textContent==='FINALIZED + SUCCESS · state read back',null,{timeout:60000});
 report.resumed_existing_transaction=tx.hash;report.resume_result=await p.locator('#tx-detail').innerText();
 if(!report.resume_result.includes('RECONCILED'))throw Error('Unexpected historical readback');
 report.checks.push('Existing finalized transaction tracked and final state read back; no resubmission');
 await p.locator('#connect').click();await p.locator('#session-wallet').click();await p.waitForFunction(()=>!document.querySelector('#wallet-dialog').open);
 if(!(await p.locator('#connect').innerText()).startsWith('Session'))throw Error('Session wallet not labelled');
 await p.locator('#connect').click();await p.locator('#disconnect').click();
 if((await p.locator('#connect').innerText())!=='Connect wallet →')throw Error('Disconnect failed');
 report.checks.push('Explicit session account connects and disconnects without signing');
 report.responsive_widths={};
 for(const width of [320,360,390,768,1440]){
  await p.setViewportSize({width,height:900});const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Horizontal overflow at '+width);report.responsive_widths[width]={horizontal_overflow:false};
 }
 await p.setViewportSize({width:1440,height:1100});await p.screenshot({path:'evidence/final-desktop.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'evidence/final-mobile.png',fullPage:true});
 await p.locator(`[data-id="${historical.case_id}"]`).click();const detail=await p.locator('#detail-content').innerText();
 if(!detail.includes('All declared units reconciled')||!detail.includes('F-1170-2024'))throw Error('Missing reconciled source detail');
 report.checks.push('Reconciled detail shows verified FDA record and quantity accounting');
 if(report.page_errors.length)throw Error('Browser JS error');
 fs.writeFileSync('evidence/frontend-review.json',JSON.stringify(report,null,2)+'\n');await b.close();console.log(JSON.stringify(report,null,2));
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1});
