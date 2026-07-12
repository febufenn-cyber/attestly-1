# ADR 0009: Dedicated extraction service without database credentials

- Status: Accepted
- Date: 2026-07-12

## Decision

Heavy document parsing runs in a dedicated Node service. The Cloudflare ingestion Worker verifies tenant and object identity, creates a five-minute signed source URL, and calls the extractor through internal authentication. The extractor receives no Supabase service-role or database credentials.

## Why

PDF and OOXML parsers have a materially larger attack and resource surface than the edge API. Removing database credentials limits the blast radius of a parser compromise. The extractor can access only the signed object URL and an optional allowlisted malware scanner.

## Consequences

- Infrastructure must deny general outbound access where practical.
- The extractor validates source hostname, transport, size, and SHA-256.
- Results are untrusted until schema validation and service-only persistence succeed.
- Extraction deployment remains separate from Cloudflare Worker deployment.
