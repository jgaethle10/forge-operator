# Forge Operator Release Contract

GitHub is the durable source-of-truth for Forge Operator.

A source commit is not a production release by itself. Evercraft treats release as a bounded sequence:

1. **Source**
   - change lands in the canonical GitHub repository;
   - secrets never enter source control.

2. **Verify**
   - TypeScript/type checks pass;
   - the Vite production build passes;
   - the production Docker image builds;
   - a disposable container starts;
   - `/api/health`, `/api/capabilities`, `/llms.txt`, and the well-known capability manifest read back successfully.

3. **Artifact**
   - the exact verified commit SHA identifies the candidate release;
   - deployment must consume that verified source/artifact lineage rather than an unrelated working tree.

4. **Deploy**
   - the target runtime is an Evercraft-approved runtime;
   - credentials live only in that runtime's secret boundary;
   - deployment must not require Base44 authentication.

5. **Production verification**
   - independently read back `/api/health`;
   - verify expected service/version identity;
   - verify public discovery surfaces;
   - verify any commercial/payment surface separately when it changes;
   - only then mark the release live.

6. **Rollback**
   - retain the previously verified commit/artifact;
   - rollback must be possible without reconstructing source from chat or a legacy builder.

## Human gates

Deploying code may be automated after its target runtime and permissions are approved.

Any action that creates or changes a paid infrastructure obligation, customer payment obligation, consequential external communication, legal commitment, employment decision, or other explicitly gated action remains human-approved.

## Legacy systems

Base44 may remain an adapter for existing applications while they are migrated. New Forge Operator release architecture must not deepen a Base44 deployment dependency.
