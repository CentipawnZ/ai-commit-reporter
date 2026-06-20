import * as core from '@actions/core';
import * as github from '@actions/github';
import { generateReport } from './llm';

async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true });
    const llmProvider = core.getInput('llm-provider', { required: true });
    const llmApiKey = core.getInput('llm-api-key', { required: true });
    const llmModel = core.getInput('llm-model');
    const llmBaseUrl = core.getInput('llm-base-url');
    const customPrompt = core.getInput('prompt-template');
    const locale = core.getInput('locale');
    const outputMode = core.getInput('output-mode');

    const octokit = github.getOctokit(token);
    const context = github.context;

    let commits: string[] = [];
    let diffs = '';
    const includeDiff = core.getInput('include-code-changes') === 'true';

    if (context.eventName === 'pull_request') {
      const prNumber = context.payload.pull_request?.number;
      if (!prNumber) throw new Error('Could not get PR number from context');

      const { data } = await octokit.rest.pulls.listCommits({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: prNumber,
      });
      
      commits = data.map((commit) => commit.commit.message);

      if (includeDiff) {
        try {
          const { data: files } = await octokit.rest.pulls.listFiles({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: prNumber,
          });
          diffs = files.map(f => `File: ${f.filename}\n${f.patch || ''}`).join('\n\n');
        } catch (e: any) {
          core.warning(`Failed to fetch PR diff: ${e.message}`);
        }
      }
    } else {
      // Fallback to push event commits
      const payloadCommits = context.payload.commits;
      if (payloadCommits && Array.isArray(payloadCommits)) {
        commits = payloadCommits.map((c: any) => c.message);
        
        if (includeDiff) {
          try {
            for (const commit of payloadCommits) {
              const { data: commitData } = await octokit.rest.repos.getCommit({
                owner: context.repo.owner,
                repo: context.repo.repo,
                ref: commit.id
              });
              if (commitData.files) {
                const commitDiff = commitData.files.map((f: any) => `File: ${f.filename}\n${f.patch || ''}`).join('\n\n');
                diffs += `\n\nCommit ${commit.id}:\n${commitDiff}`;
              }
            }
          } catch(e: any) {
            core.warning(`Failed to fetch commit diffs: ${e.message}`);
          }
        }
      } else {
        core.info('No commits found in event payload.');
        return;
      }
    }

    if (diffs.length > 40000) {
      core.info('Truncating diffs to avoid token limit.');
      diffs = diffs.substring(0, 40000) + '\n... (diff truncated)';
    }

    if (commits.length === 0) {
      core.info('No commits to process.');
      return;
    }

    core.info(`Found ${commits.length} commits. Generating report using ${llmProvider}...`);
    
    const report = await generateReport(commits, diffs, {
      provider: llmProvider,
      apiKey: llmApiKey,
      model: llmModel,
      baseUrl: llmBaseUrl,
      customPrompt: customPrompt,
      locale: locale
    });

    core.setOutput('report', report);

    if (outputMode === 'pr_comment' && context.eventName === 'pull_request') {
      const prNumber = context.payload.pull_request?.number;
      if (prNumber) {
        await octokit.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: prNumber,
          body: `### 🤖 AI Commit Report\n\n${report}`,
        });
        core.info('Successfully commented on the PR.');
      }
    } else {
      core.info('Generated Report:');
      core.info(report);
    }

  } catch (error: any) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

run();
