#!/usr/bin/env bun

import { IssueTriage } from './src/issue-triager';

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN environment variable is required');
  process.exit(1);
}

async function testMultipleIssues() {
  console.log('Testing concurrent issue triage...\n');
  
  const triager = new IssueTriage(token!);
  
  try {
    const results = await triager.triageMultipleIssues(
      'chhoumann',
      'quickadd',
      '/home/christian/projects/quickadd',
      {
        state: 'open',
        limit: 3  // Test with 3 issues
      }
    );
    
    console.log('\nResults:');
    for (const result of results) {
      console.log(`\nIssue #${result.issue.number}: ${result.issue.title}`);
      console.log('Recommendation:', JSON.stringify(result.recommendation, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testMultipleIssues();