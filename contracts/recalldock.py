# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


def pack(x):
    return json.dumps(x, sort_keys=True, separators=(",", ":"))


def need(ok, message):
    if not ok:
        raise Exception(message)


def text(x, low, high):
    need(type(x) is str and low <= len(x.strip()) <= high, "INVALID_TEXT")
    need(not any(ord(c) < 32 or ord(c) == 127 for c in x), "CONTROL_CHARACTER")
    return x.strip()


def address(x):
    need(type(x) is str and len(x) == 42 and x.startswith("0x") and all(c in "0123456789abcdefABCDEF" for c in x[2:]), "INVALID_ADDRESS")
    need(int(x[2:], 16) != 0, "ZERO_ADDRESS")
    return x.lower()


def integer(x, low, high):
    need(type(x) is int and low <= x <= high, "INVALID_QUANTITY")
    return x


def recall_number(x):
    need(type(x) is str and len(x) == 11 and x[:2] == "F-" and x[6] == "-" and all(c in "0123456789" for c in x[2:6] + x[7:]), "INVALID_FOOD_RECALL_NUMBER")
    return x


def source_url(number):
    return 'https://api.fda.gov/food/enforcement.json?search=recall_number:%22' + number + '%22&limit=1'


def fetch_recall(number):
    response = gl.nondet.web.get(source_url(number))
    need(response.status == 200, "FDA_UNAVAILABLE_OR_NOT_FOUND")
    body = response.body
    if isinstance(body, bytes):
        body = body.decode("utf-8")
    data = json.loads(body)
    rows = data.get("results", [])
    need(len(rows) == 1 and rows[0].get("recall_number") == number, "FDA_RECORD_MISMATCH")
    row = rows[0]
    need(row.get("product_type") == "Food", "NOT_FOOD_RECALL")
    need(row.get("classification") in ["Class I", "Class II", "Class III"], "UNCLASSIFIED_RECALL")
    need(row.get("status") in ["Ongoing", "Completed", "Terminated"], "UNKNOWN_FDA_STATUS")
    result = {"source_url": source_url(number), "dataset_updated": data["meta"]["last_updated"]}
    for key in ["recall_number", "event_id", "status", "classification", "recalling_firm", "product_description", "reason_for_recall", "code_info", "recall_initiation_date", "report_date"]:
        value = row.get(key, "")
        need(type(value) is str and len(value) <= 20000, "MALFORMED_FDA_RECORD")
        result[key] = value
    need(bool(result["product_description"]) and bool(result["reason_for_recall"]), "INCOMPLETE_FDA_RECORD")
    return result


class RecallDock(gl.Contract):
    cases: TreeMap[str, str]
    ids: str

    def __init__(self):
        self.ids = pack([])

    def _load(self, case_id):
        raw = self.cases.get(case_id, "")
        need(bool(raw), "CASE_NOT_FOUND")
        return json.loads(raw)

    def _save(self, case):
        need(case["resolved"] + case["remaining"] == case["quantity"], "QUANTITY_INVARIANT")
        self.cases[case["id"]] = pack(case)

    @gl.public.write
    def open_case(self, reference: str, number: str, lot: str, quantity: int, custodian: str) -> str:
        reference = text(reference, 3, 40)
        need(all(c in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in reference), "INVALID_REFERENCE")
        number = recall_number(number)
        lot = text(lot, 2, 160)
        quantity = integer(quantity, 1, 1000000000)
        custodian = address(custodian)
        owner = str(gl.message.sender_address).lower()
        need(owner != custodian, "INDEPENDENT_CUSTODIAN_REQUIRED")
        case_id = owner + ":" + reference
        need(not self.cases.get(case_id, ""), "DUPLICATE_REFERENCE")
        ids = json.loads(self.ids)
        need(len(ids) < 2000, "REGISTRY_FULL")
        owned = 0
        for cid in ids:
            if cid.startswith(owner + ":"):
                owned += 1
        need(owned < 64, "OWNER_LIMIT")
        case = {"id": case_id, "reference": reference, "owner": owner, "custodian": custodian, "recall_number": number, "lot": lot, "quantity": quantity, "remaining": quantity, "resolved": 0, "state": "UNVERIFIED", "source": None, "revision": 0, "proposal": None, "history": []}
        self._save(case)
        ids.append(case_id)
        self.ids = pack(ids)
        return case_id

    @gl.public.write
    def verify_recall(self, case_id: str) -> str:
        case = self._load(case_id)
        need(case["state"] == "UNVERIFIED", "NOT_UNVERIFIED")
        number = case["recall_number"]

        def fetch():
            return fetch_recall(number)

        def validate(candidate):
            if not isinstance(candidate, gl.vm.Return):
                return False
            try:
                # Every validator independently retrieves FDA data. Exact equality
                # covers identity, affected codes, reason, class and publication version.
                return pack(candidate.calldata) == pack(fetch())
            except Exception:
                return False

        result = gl.vm.run_nondet_unsafe(fetch, validate)
        case["source"] = result
        # A terminated recall is never evidence that an individual lot is safe.
        case["state"] = "QUARANTINED"
        self._save(case)
        return pack(case)

    @gl.public.write
    def propose_disposition(self, case_id: str, action: str, quantity: int, evidence_ref: str) -> str:
        case = self._load(case_id)
        need(str(gl.message.sender_address).lower() == case["custodian"], "CUSTODIAN_ONLY")
        need(case["state"] == "QUARANTINED" and case["proposal"] is None, "NOT_READY")
        need(action in ["RETURN", "DESTROY"], "INVALID_ACTION")
        quantity = integer(quantity, 1, case["remaining"])
        evidence_ref = text(evidence_ref, 3, 240)
        need(len(case["history"]) < 100, "HISTORY_LIMIT")
        case["revision"] += 1
        case["proposal"] = {"revision": case["revision"], "action": action, "quantity": quantity, "evidence_ref": evidence_ref}
        case["state"] = "AWAITING_CONFIRMATION"
        self._save(case)
        return pack(case)

    @gl.public.write
    def confirm_disposition(self, case_id: str, revision: int, accept: bool) -> str:
        case = self._load(case_id)
        need(str(gl.message.sender_address).lower() == case["owner"], "OWNER_ONLY")
        need(case["state"] == "AWAITING_CONFIRMATION", "NO_PROPOSAL")
        need(type(revision) is int and revision == case["revision"], "STALE_REVISION")
        need(type(accept) is bool, "INVALID_DECISION")
        proposal = case["proposal"]
        case["history"].append({**proposal, "accepted": accept})
        if accept:
            case["resolved"] += proposal["quantity"]
            case["remaining"] -= proposal["quantity"]
        case["proposal"] = None
        case["state"] = "RECONCILED" if case["remaining"] == 0 else "QUARANTINED"
        self._save(case)
        return pack(case)

    @gl.public.write
    def cancel_case(self, case_id: str) -> str:
        case = self._load(case_id)
        need(str(gl.message.sender_address).lower() == case["owner"], "OWNER_ONLY")
        need(case["state"] == "UNVERIFIED", "VERIFIED_CASE_CANNOT_CANCEL")
        case["state"] = "CANCELLED"
        self._save(case)
        return pack(case)

    @gl.public.view
    def get_case(self, case_id: str) -> str:
        return pack(self._load(case_id))

    @gl.public.view
    def list_cases(self, offset: int, limit: int) -> str:
        integer(offset, 0, 2000)
        integer(limit, 1, 20)
        ids = json.loads(self.ids)
        return pack({"total": len(ids), "cases": [self._load(cid) for cid in ids[offset:offset + limit]]})
