/**
 * Main test suite
 * 
 * Run all examples and tests to verify the system works correctly
 */

import { runCounterExample } from './examples/counter.js';
import { runParticleExample } from './examples/particles.js';
import { runDistributedExample } from './examples/distributed.js';
import { runDeterminismTest } from './examples/determinism-test.js';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  DDS-TS: Deterministic Distributed Simulation Engine ║');
  console.log('║  AI-Takeover Framework                                ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  try {
    // Test 1: Counter example
    console.log('\n' + '─'.repeat(60));
    runCounterExample();
    console.log('─'.repeat(60));

    // Test 2: Particle physics
    console.log('\n' + '─'.repeat(60));
    runParticleExample();
    console.log('─'.repeat(60));

    // Test 3: Determinism verification
    console.log('\n' + '─'.repeat(60));
    runDeterminismTest();
    console.log('─'.repeat(60));

    // Test 4: Distributed simulation
    console.log('\n' + '─'.repeat(60));
    await runDistributedExample();
    console.log('─'.repeat(60));

    console.log('\n✓ All tests passed!');
    console.log('\nSystem is ready for use.');
    console.log('\nNext steps:');
    console.log('  1. npm run build  - Compile TypeScript');
    console.log('  2. Create your own simulation using the examples as templates');
    console.log('  3. Test across different platforms (browser, Node.js, Deno)');
    
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  }
}

main();
