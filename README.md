# Token Radar

A token launch radar: ranks pre-token DeFi protocols by implied launch value and shows how to farm each one. Built for the make.fun token-radar-01 bounty.

- Reads a sealed DefiLlama snapshot and ranks protocols that record no token yet by implied value (TVL x growth x maturity x breadth), each with a concrete farm plan.
- Static dashboard, no network: sortable and filterable board, a detail view per protocol, and a separate already-trading table.
- Run it with `node main.ts --input <snapshot.json>`; output lands in `out/`.
