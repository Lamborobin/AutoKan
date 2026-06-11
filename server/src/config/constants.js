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

module.exports = {
  TEST_CLIENT_ID,
  TEST_CLIENT_NAME,
  MY_BOARD_ID,
  DEFAULT_SUB_ID,
  STEEL_CLIENT_ID,
  STEEL_CLIENT_NAME,
  HEALTH_CLIENT_ID,
  HEALTH_CLIENT_NAME,
};
