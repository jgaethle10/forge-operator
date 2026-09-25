# Systemia Core on Evercraft Compute

KAIDANCE/Systemia Core does not require a named cloud provider.

The private Core source-control bootstrap is now an explicit Evercraft Compute workload admitted through the `evercraft.capacity.v1` lease contract.

## Path

```
Systemia
  -> Yard Operator
  -> Evercraft Compute
  -> Universal Capacity Resolver / Saban
  -> legitimately granted compatible capacity
  -> systemia.private-core-origin.v1
  -> private Git origin
  -> receipt
```

Evercraft Compute is the product boundary. Underlying capacity is an implementation resource, not a product dependency. It may come from Evercraft hardware, an existing authorized machine, partner infrastructure, browser/WASM, container/VM capacity, or another legitimately exposed runtime.

No workload may silently commandeer compute. Allocation requires a live capacity offer and bounded lease.

## Security

The first Core workload is intentionally narrow. It can create and harden a private bare Git origin **only inside the filesystem root admitted by the compute node**. It cannot execute arbitrary shell commands, cannot write outside that root, and cannot accept an unregistered workload class.

Private Core source and state are not included in this public repository.
