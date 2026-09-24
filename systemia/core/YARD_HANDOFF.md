# SYSTEMIA Core Yard Handoff

Yard Operator may accept a SYSTEMIA Core release only when the release comes from the designated **private Core repository** and carries an immutable source reference.

## Admission

A Core deployment request must include:

- opaque private repository/release reference
- immutable commit or artifact digest
- CI pass receipt
- requested runtime class
- declared health check
- rollback target
- authority scope for the deployment itself

The public Forge repository never supplies private Core source.

## Deployment receipt

A successful deployment receipt must record at minimum:

- opaque release reference
- immutable artifact digest
- allocated compute lease reference
- live route reference
- health verification
- route verification
- deployed timestamp
- rollback target

## Fail closed

Yard must hold deployment when:

- the private release reference cannot be resolved
- CI is not green
- the artifact is mutable or ambiguous
- health or route verification fails
- rollback state is missing
- deployment asks for authority beyond the admitted release scope

No fallback infrastructure provider is implied by failure. Provider substitution requires separate authorization.
