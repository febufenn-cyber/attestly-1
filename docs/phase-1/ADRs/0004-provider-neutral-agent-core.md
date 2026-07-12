# ADR 0004: Provider-neutral agent core with deterministic policy and validation

- Status: Accepted
- Date: 2026-07-12

## Context

The seed blueprint names specific Claude models. Model names, capabilities, pricing, availability, data terms, and behavior change over time. Embedding business rules only inside prompts or depending on one provider would make safety, evaluation, migration, and regional deployment fragile.

## Decision

- The agent core is provider-neutral.
- Provider/model selection is configuration governed by workspace policy, region, cost, and evaluation status.
- Evidence rules, scope checks, permissions, answer states, approval requirements, schemas, and validators live outside provider prompts.
- Model output must conform to a versioned structured schema.
- Deterministic validators run after generation and may reject or downgrade output.
- Every generation run records provider, model, policy version, prompt-template version, retrieval version, schema version, and validator version.
- Switching or upgrading a model requires regression evaluation and controlled rollout.
- The system fails closed rather than silently routing restricted customer content to an unapproved fallback provider.

## Consequences

### Positive

- Reduces provider lock-in.
- Preserves safety rules across model changes.
- Enables cost/quality routing after evaluation.
- Supports future regional or private-model requirements.

### Negative

- Requires a provider interface and normalized response handling.
- Lowest-common-denominator abstractions may hide useful provider features unless extensions are designed carefully.
- Model changes require evaluation infrastructure.

## Rejected alternatives

### Hard-code one model throughout the application

Rejected because model lifecycle and data-processing terms are not stable product foundations.

### Trust the model's own confidence and citations

Rejected because self-reported confidence and generated citation identifiers do not establish evidence validity.

### Silent fallback to any available model

Rejected because customer data may reach an unapproved provider or region and behavior may change without review.
