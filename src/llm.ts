import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const DEFAULT_PROMPT = `
You are an expert technical writer and software engineer.
Summarize the following commit messages and code changes into a clear, structured release note or PR description.

Here is the list of categorized commits:
{{grouped_commits}}

{{code_changes}}

Generate a beautiful, professional, and well-structured release report.
Write the final report in the following language: {{locale}}.
`;

export interface LlmOptions {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  customPrompt?: string;
  locale?: string;
}

export function groupCommits(commits: string[]): string {
  const categories: Record<string, string[]> = {
    '🚀 Features': [],
    '🐛 Bug Fixes': [],
    '⚡ Performance': [],
    '🛠️ Refactoring': [],
    '📝 Documentation': [],
    '⚙️ Chores & CI/CD': [],
    '📦 Others': []
  };

  // Match conventional commits: type(scope)!: message
  const commitRegex = /^(feat|fix|perf|refactor|docs|chore|style|test|ci|build)(?:\(([^)]+)\))?(!?):\s+(.+)$/i;

  for (const commit of commits) {
    const trimmed = commit.trim();
    // Lấy dòng đầu tiên của commit message
    const firstLine = trimmed.split('\n')[0];
    const match = firstLine.match(commitRegex);

    if (match) {
      const [, type, scope, isBreaking, message] = match;
      const cleanType = type.toLowerCase();
      const scopeStr = scope ? `**${scope}**: ` : '';
      const breakingStr = isBreaking ? '⚠️ **BREAKING CHANGE** - ' : '';
      const formatted = `${breakingStr}${scopeStr}${message}`;

      if (cleanType === 'feat') categories['🚀 Features'].push(formatted);
      else if (cleanType === 'fix') categories['🐛 Bug Fixes'].push(formatted);
      else if (cleanType === 'perf') categories['⚡ Performance'].push(formatted);
      else if (cleanType === 'refactor') categories['🛠️ Refactoring'].push(formatted);
      else if (cleanType === 'docs') categories['📝 Documentation'].push(formatted);
      else if (['chore', 'ci', 'build', 'style', 'test'].includes(cleanType)) {
        categories['⚙️ Chores & CI/CD'].push(formatted);
      } else {
        categories['📦 Others'].push(firstLine);
      }
    } else {
      categories['📦 Others'].push(firstLine);
    }
  }

  let output = '';
  for (const [category, items] of Object.entries(categories)) {
    if (items.length > 0) {
      output += `${category}:\n`;
      output += items.map(item => `- ${item}`).join('\n') + '\n\n';
    }
  }
  return output.trim();
}

export async function generateReport(
  commits: string[],
  diffs: string,
  options: LlmOptions
): Promise<string> {
  const rawCommitList = commits.map(c => `- ${c.split('\n')[0]}`).join('\n');
  const groupedCommitList = groupCommits(commits);

  const template = options.customPrompt || DEFAULT_PROMPT;

  const prompt = template
    .replace('{{commits}}', rawCommitList)
    .replace('{{grouped_commits}}', groupedCommitList)
    .replace('{{code_changes}}', diffs ? `Here are the code changes (diffs):\n${diffs}` : '')
    .replace('{{locale}}', options.locale || 'English');

  const provider = options.provider.toLowerCase();

  if (provider === 'openai' || provider === 'custom') {
    const config: any = { apiKey: options.apiKey };
    if (options.baseUrl) {
      config.baseURL = options.baseUrl;
    }

    const openai = new OpenAI(config);
    const response = await openai.chat.completions.create({
      model: options.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0]?.message?.content || '';
  }

  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(options.apiKey);
    const model = genAI.getGenerativeModel({ model: options.model || 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  throw new Error(`Unsupported LLM provider: ${options.provider}`);
}
