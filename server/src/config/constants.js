// Stable IDs and shared constants. Edit values only on a fresh DB —
// these are referenced by seeds and FK relationships.

const TEST_CLIENT_ID   = 'prj_a1b2c3d4';   // demo project for dev/testing
const TEST_CLIENT_NAME = 'Velour';          // display name of the seeded client
const MY_BOARD_ID      = 'prj_myboard01';  // default personal board
const DEFAULT_SUB_ID   = 'sub_default';    // single-tenant default subscription

const STEEL_CLIENT_ID   = 'prj_steel001';          // fictional steel factory demo board
const STEEL_CLIENT_NAME = 'Nordstahl Industries';  // fictional steel manufacturer

const HEALTH_CLIENT_ID   = 'prj_health01';     // fictional hospital network demo board
const HEALTH_CLIENT_NAME = 'Norvik Health';    // fictional regional hospital network

const FINANCE_CLIENT_ID   = 'prj_finance01';   // fictional financial group demo board
const FINANCE_CLIENT_NAME = 'Meridian Capital'; // fictional lending + investment group

const NORDVIK_CLIENT_ID   = 'prj_nordvik01';   // fictional Swedish credit-market firm demo board
const NORDVIK_CLIENT_NAME = 'Nordvik Kredit';   // fictional Swedish lending + savings institution (Swedish-language board)

const BENCH_SANDBOX_ID   = 'prj_bench0001';       // neutral board for the rule-compliance benchmark's global/workspace-layer cases
const BENCH_SANDBOX_NAME = 'Benchmark Sandbox';   // no client, no board-level docs — only docs/rules.md + workspace docs apply

module.exports = {
  TEST_CLIENT_ID,
  TEST_CLIENT_NAME,
  MY_BOARD_ID,
  DEFAULT_SUB_ID,
  STEEL_CLIENT_ID,
  STEEL_CLIENT_NAME,
  HEALTH_CLIENT_ID,
  HEALTH_CLIENT_NAME,
  FINANCE_CLIENT_ID,
  FINANCE_CLIENT_NAME,
  NORDVIK_CLIENT_ID,
  NORDVIK_CLIENT_NAME,
  BENCH_SANDBOX_ID,
  BENCH_SANDBOX_NAME,
};
