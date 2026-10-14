package main

import (
    "bytes"
    "encoding/json"
    "strings"
    "testing"
)

const base = `{"schema_version":"1","operation_id":"op-1","idempotency_key":"idem-1","intended_action":"create_ticket","agent_report":"success","observations":[]}`

func mustParse(t *testing.T, s string) Input {
    t.Helper()
    in,err:=parse(strings.NewReader(s)); if err!=nil {t.Fatal(err)}
    return in
}
func TestAgentSuccessWithoutProviderProofIsUnknown(t *testing.T) {
    out:=classify(mustParse(t,base))
    if out.Assessment!="UNKNOWN"||out.ExternallyVerified {t.Fatalf("unexpected %#v",out)}
}
func TestMatchingCommittedClaimsAreStillUnverified(t *testing.T){
    in:=mustParse(t,`{"schema_version":"1","operation_id":"op-1","idempotency_key":"idem-1","intended_action":"create_ticket","observations":[{"operation_id":"op-1","idempotency_key":"idem-1","provider_state":"committed","reference":"ref-4"}]}`)
    out:=classify(in)
    if out.Assessment!="UNVERIFIED_COMMITTED_CLAIM"||out.ExternallyVerified {t.Fatalf("false verification %#v",out)}
}
func TestMissingReferenceIsUnknown(t *testing.T){
    in:=mustParse(t,`{"schema_version":"1","operation_id":"op-1","idempotency_key":"idem-1","intended_action":"create_ticket","observations":[{"operation_id":"op-1","idempotency_key":"idem-1","provider_state":"committed","reference":""}]}`)
    if x:=classify(in);x.Assessment!="UNKNOWN" {t.Fatalf("%#v",x)}
}
func TestMismatchedIdempotencyIsConflict(t *testing.T){
    in:=mustParse(t,`{"schema_version":"1","operation_id":"op-1","idempotency_key":"idem-1","intended_action":"create_ticket","observations":[{"operation_id":"op-1","idempotency_key":"DIFFERENT","provider_state":"committed","reference":"ref-4"}]}`)
    if x:=classify(in);x.Assessment!="CONFLICT" {t.Fatalf("%#v",x)}
}
func TestContradictoryClaimsConflict(t *testing.T){
    in:=mustParse(t,`{"schema_version":"1","operation_id":"op-1","idempotency_key":"idem-1","intended_action":"create_ticket","observations":[{"operation_id":"op-1","idempotency_key":"idem-1","provider_state":"failed"},{"operation_id":"op-1","idempotency_key":"idem-1","provider_state":"committed","reference":"ref-4"}]}`)
    if x:=classify(in);x.Assessment!="CONFLICT" {t.Fatalf("%#v",x)}
}
func TestNotFoundDoesNotProveNoCommit(t *testing.T){
    in:=mustParse(t,`{"schema_version":"1","operation_id":"op-1","idempotency_key":"idem-1","intended_action":"create_ticket","observations":[{"operation_id":"op-1","idempotency_key":"idem-1","provider_state":"not_found"}]}`)
    if x:=classify(in);x.Assessment!="UNKNOWN" {t.Fatalf("%#v",x)}
}
func TestFailedIsUnverified(t *testing.T){
    in:=mustParse(t,`{"schema_version":"1","operation_id":"op-1","idempotency_key":"idem-1","intended_action":"create_ticket","observations":[{"operation_id":"op-1","idempotency_key":"idem-1","provider_state":"failed"}]}`)
    if x:=classify(in);x.Assessment!="UNVERIFIED_FAILED_CLAIM"||x.ExternallyVerified {t.Fatalf("%#v",x)}
}
func TestRejectUnknownFieldsAndTrailingJSON(t *testing.T){
    for _,s:=range []string{strings.Replace(base,`"observations":[]`,`"unknown":true,"observations":[]`,1),base+" {}"} {
        if _,err:=parse(strings.NewReader(s));err==nil {t.Fatal("accepted malformed input")}
    }
}
func TestRejectMissingRequiredAndUnsupportedState(t *testing.T){
    for _,s:=range []string{`{"schema_version":"1"}`,strings.Replace(base,`"observations":[]`,`"observations":[{"operation_id":"op-1","idempotency_key":"idem-1","provider_state":"magically_paid"}]`,1)} {
        if _,err:=parse(strings.NewReader(s));err==nil {t.Fatal("accepted invalid schema")}
    }
}
func TestCLIDoesNotProclaimVerification(t *testing.T){
    var stdout,stderr bytes.Buffer
    if code:=run([]string{"--help"},&stdout,&stderr);code!=0 {t.Fatal(code)}
    if !strings.Contains(stdout.String(),"NOT independently verified") {t.Fatal("missing trust disclaimer")}
    v:=classify(mustParse(t,base));raw,_:=json.Marshal(v)
    if strings.Contains(string(raw),`"externally_verified":true`) {t.Fatal("false verified")}
}
