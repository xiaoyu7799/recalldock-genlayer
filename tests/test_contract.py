"""Mocked-host rule tests; these do not prove GenVM consensus."""
import sys,types,json,importlib.util,unittest,copy
class Return:
 def __init__(self,x): self.calldata=x
class Base:
 def __new__(cls):
  obj=super().__new__(cls); obj.cases={}; return obj
class Web:
 def __init__(self): self.rows=[]
 def get(self,url):
  x=self.rows.pop(0) if len(self.rows)>1 else self.rows[0]
  if isinstance(x,Exception):raise x
  return types.SimpleNamespace(status=200,body=json.dumps(x).encode())
web=Web()
def run(fetch,validate):
 x=fetch()
 if not validate(Return(x)):raise Exception('DISAGREE')
 return x
gl=types.SimpleNamespace(Contract=Base,public=types.SimpleNamespace(write=lambda f:f,view=lambda f:f),message=types.SimpleNamespace(sender_address=''),nondet=types.SimpleNamespace(web=web),vm=types.SimpleNamespace(Return=Return,run_nondet_unsafe=run))
m=types.ModuleType('genlayer');m.gl=gl;m.TreeMap=dict;sys.modules['genlayer']=m
spec=importlib.util.spec_from_file_location('contract','contracts/recalldock.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
A='0x'+'a'*40;B='0x'+'b'*40;C='0x'+'c'*40
row={'recall_number':'F-1170-2024','product_type':'Food','classification':'Class I','status':'Ongoing','product_description':'Example food','reason_for_recall':'Contaminant','code_info':'LOT-A'}
def fixture():return {'meta':{'last_updated':'2026-11-04'},'results':[dict(row)]}
class Rules(unittest.TestCase):
 def setUp(self):
  gl.message.sender_address=A;web.rows=[fixture()];self.c=c.RecallDock();self.id=self.c.open_case('lot-a','F-1170-2024','LOT-A',100,B)
 def get(self):return json.loads(self.c.get_case(self.id))
 def verify(self):self.c.verify_recall(self.id)
 def proposal(self,n=40):
  gl.message.sender_address=B;self.c.propose_disposition(self.id,'RETURN',n,'receipt-001');gl.message.sender_address=A
 def test_full_partial_reconciliation(self):
  self.verify();self.proposal();self.c.confirm_disposition(self.id,1,True);self.assertEqual(self.get()['remaining'],60)
  self.proposal(60);self.c.confirm_disposition(self.id,2,True);self.assertEqual(self.get()['state'],'RECONCILED')
  with self.assertRaises(Exception):self.proposal(1)
 def test_rejection_no_quantity_change(self):
  self.verify();self.proposal();self.c.confirm_disposition(self.id,1,False);self.assertEqual(self.get()['remaining'],100);self.assertFalse(self.get()['history'][0]['accepted'])
 def test_permissions(self):
  self.verify();gl.message.sender_address=A
  with self.assertRaises(Exception):self.c.propose_disposition(self.id,'DESTROY',1,'abc')
  self.proposal();gl.message.sender_address=B
  with self.assertRaises(Exception):self.c.confirm_disposition(self.id,1,True)
 def test_replay_and_stale_revision(self):
  self.verify();self.proposal()
  with self.assertRaises(Exception):self.c.confirm_disposition(self.id,0,True)
  self.c.confirm_disposition(self.id,1,True)
  with self.assertRaises(Exception):self.c.confirm_disposition(self.id,1,True)
 def test_disagree_no_mutation(self):
  different=fixture();different['results'][0]['code_info']='LOT-B';web.rows=[fixture(),different];before=self.get()
  with self.assertRaisesRegex(Exception,'DISAGREE'):self.verify()
  self.assertEqual(self.get(),before)
 def test_missing_source_fail_closed(self):
  web.rows=[Exception('offline')]
  with self.assertRaises(Exception):self.verify()
  self.assertEqual(self.get()['state'],'UNVERIFIED')
 def test_record_mismatch(self):
  f=fixture();f['results'][0]['recall_number']='F-0000-2024';web.rows=[f]
  with self.assertRaises(Exception):self.verify()
 def test_terminated_never_releases(self):
  f=fixture();f['results'][0]['status']='Terminated';web.rows=[f];self.verify();self.assertEqual(self.get()['state'],'QUARANTINED')
 def test_guards(self):
  for n in [0,-1,True,1000000001]:
   with self.assertRaises(Exception):self.c.open_case('new-ref','F-1170-2024','aa',n,B)
  with self.assertRaises(Exception):self.c.open_case('new-ref','F-1170-2024','aa',1,A)
  with self.assertRaises(Exception):self.c.open_case('lot-a','F-1170-2024','aa',1,B)
  with self.assertRaises(Exception):self.c.open_case('new-ref','F-1170-2024"','aa',1,B)
 def test_overallocation_pending_and_cancel(self):
  self.verify()
  with self.assertRaises(Exception):self.c.cancel_case(self.id)
  gl.message.sender_address=B
  with self.assertRaises(Exception):self.c.propose_disposition(self.id,'RETURN',101,'abc')
  with self.assertRaises(Exception):self.c.propose_disposition(self.id,'RELEASE',1,'abc')
  self.c.propose_disposition(self.id,'DESTROY',40,'abc')
  with self.assertRaises(Exception):self.c.propose_disposition(self.id,'DESTROY',40,'abc')
 def test_cancel_unverified(self):
  self.c.cancel_case(self.id)
  with self.assertRaises(Exception):self.verify()
 def test_pagination(self):
  self.assertEqual(json.loads(self.c.list_cases(0,20))['total'],1)
  with self.assertRaises(Exception):self.c.list_cases(0,21)
if __name__=='__main__':unittest.main()
