// entire-blackbox is a deliberately non-effectful Entire external-command candidate.
// Its local input is untrusted; matching claims are NEVER called provider-verified.
package main

import (
    "bytes"
    "encoding/json"
    "errors"
    "fmt"
    "io"
    "os"
    "strings"
)

const maxInputBytes = 1 << 20

type Observation struct {
    OperationID    string `json:"operation_id"`
    IdempotencyKey string `json:"idempotency_key"`
    ProviderState   string `json:"provider_state"`
    Reference       string `json:"reference"`
}
type Input struct {
    SchemaVersion   string        `json:"schema_version"`
    OperationID     string        `json:"operation_id"`
    IdempotencyKey  string        `json:"idempotency_key"`
    IntendedAction  string        `json:"intended_action"`
    AgentReport     string        `json:"agent_report,omitempty"`
    Observations    []Observation `json:"observations"`
}
type Assessment struct {
    SchemaVersion       string `json:"schema_version"`
    OperationID         string `json:"operation_id"`
    Assessment          string `json:"assessment"`
    ExternallyVerified  bool   `json:"externally_verified"`
    EvidenceCount       int    `json:"evidence_count"`
    Explanation         string `json:"explanation"`
    NextAction          string `json:"next_action"`
}


// rejectDuplicateJSONMembers prevents a later JSON member from silently replacing
// an earlier claimed operation, idempotency key, or provider state. Go's normal
// struct decoder accepts repeated keys, even when DisallowUnknownFields is set.
// The input is untrusted. Cap nesting and apply case-insensitive matching to
// reflect encoding/json's field-name matching semantics.
func rejectDuplicateJSONMembers(raw []byte) error {
    dec := json.NewDecoder(bytes.NewReader(raw))
    var walk func(int) error
    walk = func(depth int) error {
        if depth > 16 { return errors.New("JSON nesting exceeds 16 levels") }
        token, err := dec.Token()
        if err != nil { return err }
        delim, isDelim := token.(json.Delim)
        if !isDelim { return nil }
        switch delim {
        case '{':
            seen := make(map[string]bool)
            for dec.More() {
                keyToken, err := dec.Token()
                if err != nil { return err }
                key, ok := keyToken.(string)
                if !ok { return errors.New("invalid JSON object key") }
                folded := strings.ToLower(key)
                if seen[folded] { return fmt.Errorf("duplicate JSON member %q", key) }
                seen[folded] = true
                if err := walk(depth+1); err != nil { return err }
            }
            end, err := dec.Token()
            if err != nil { return err }
            if end != json.Delim('}') { return errors.New("invalid JSON object ending") }
        case '[':
            for dec.More() {
                if err := walk(depth+1); err != nil { return err }
            }
            end, err := dec.Token()
            if err != nil { return err }
            if end != json.Delim(']') { return errors.New("invalid JSON array ending") }
        default:
            return errors.New("unexpected JSON delimiter")
        }
        return nil
    }
    if err := walk(0); err != nil { return err }
    if _, err := dec.Token(); err != io.EOF {
        return errors.New("input must contain exactly one JSON document")
    }
    return nil
}

func parse(r io.Reader) (Input, error) {
    var in Input
    raw, err := io.ReadAll(io.LimitReader(r, maxInputBytes+1))
    if err != nil { return in, err }
    if len(raw) > maxInputBytes { return in, errors.New("input exceeds 1 MiB") }
    if err := rejectDuplicateJSONMembers(raw); err != nil { return in, fmt.Errorf("invalid input: %w", err) }
    dec := json.NewDecoder(bytes.NewReader(raw))
    dec.DisallowUnknownFields()
    if err := dec.Decode(&in); err != nil { return in, fmt.Errorf("invalid input: %w", err) }
    var extra any
    if err := dec.Decode(&extra); err != io.EOF {
        return in, errors.New("input must contain exactly one JSON document")
    }
    if in.SchemaVersion != "1" { return in, errors.New("schema_version must be 1") }
    if strings.TrimSpace(in.OperationID) == "" || strings.TrimSpace(in.IdempotencyKey) == "" || strings.TrimSpace(in.IntendedAction) == "" {
        return in, errors.New("operation_id, idempotency_key, and intended_action are required")
    }
    if len(in.Observations) > 32 { return in, errors.New("no more than 32 observations allowed") }
    for _, o := range in.Observations {
        if strings.TrimSpace(o.OperationID) == "" || strings.TrimSpace(o.IdempotencyKey) == "" || strings.TrimSpace(o.ProviderState) == "" {
            return in, errors.New("observation requires operation_id, idempotency_key, and provider_state")
        }
        switch o.ProviderState {
        case "committed", "failed", "pending", "not_found":
        default: return in, fmt.Errorf("unsupported provider_state %q", o.ProviderState)
        }
    }
    return in, nil
}

// classify only compares untrusted supplied observations, never contacts a provider.
// NOT_FOUND is not proof that an action failed or did not commit.
func classify(in Input) Assessment {
    out := Assessment{
        SchemaVersion: "1", OperationID: in.OperationID, Assessment: "UNKNOWN",
        ExternallyVerified: false, EvidenceCount: len(in.Observations),
        Explanation: "No authenticated provider readback was performed by this command.",
        NextAction: "Obtain authenticated provider readback for the exact operation and idempotency key; do not blindly retry.",
    }
    if len(in.Observations) == 0 {
        out.Explanation = "No provider observations supplied; agent reports alone cannot establish an external side effect."
        return out
    }
    states := make(map[string]bool)
    for _, o := range in.Observations {
        if o.OperationID != in.OperationID || o.IdempotencyKey != in.IdempotencyKey {
            out.Assessment = "CONFLICT"
            out.Explanation = "Supplied evidence includes a different operation or idempotency key."
            out.NextAction = "Stop automated retries and investigate mismatched evidence with the provider."
            return out
        }
        states[o.ProviderState] = true
    }
    if len(states) > 1 {
        out.Assessment = "CONFLICT"
        out.Explanation = "Supplied observations disagree on the provider state."
        out.NextAction = "Stop automated retries and reconcile the contradictory provider observations."
        return out
    }
    if states["committed"] {
        for _, o := range in.Observations {
            if strings.TrimSpace(o.Reference) == "" {
                out.Explanation = "A committed claim has no provider reference; outcome remains unknown."
                return out
            }
        }
        out.Assessment = "UNVERIFIED_COMMITTED_CLAIM"
        out.Explanation = "Locally supplied claims consistently say committed, but their provenance and authenticity have NOT been verified."
        out.NextAction = "Independently fetch the provider record and validate the reference before treating this action as committed."
    } else if states["failed"] {
        out.Assessment = "UNVERIFIED_FAILED_CLAIM"
        out.Explanation = "Locally supplied claims consistently say failed; no provider authentication or absence-of-commit guarantee exists."
        out.NextAction = "Independently verify the provider's final state before retrying or billing."
    } else {
        out.Explanation = "The supplied state is pending or not_found; neither establishes a final external outcome."
    }
    return out
}

func run(args []string, stdout, stderr io.Writer) int {
    if len(args) == 1 && (args[0] == "--help" || args[0] == "help" || args[0] == "-h") {
        fmt.Fprintln(stdout, "Evercraft Black Box (Entire external-command candidate)\nUsage: entire blackbox inspect <local-json-file>\nLocal, read-only, zero network, zero payments. Supplied evidence is NOT independently verified.")
        return 0
    }
    if len(args) != 2 || args[0] != "inspect" || args[1] == "" {
        fmt.Fprintln(stderr, "usage: entire blackbox inspect <local-json-file> (or --help)")
        return 2
    }
    f, err := os.Open(args[1]); if err != nil { fmt.Fprintln(stderr, "input error:", err); return 2 }; defer f.Close()
    in, err := parse(f); if err != nil { fmt.Fprintln(stderr, "input error:", err); return 2 }
    if err := json.NewEncoder(stdout).Encode(classify(in)); err != nil { fmt.Fprintln(stderr, "output error:", err); return 2 }
    return 0
}

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr)) }
