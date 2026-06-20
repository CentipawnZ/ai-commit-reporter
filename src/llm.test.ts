import { describe, it, expect, jest } from '@jest/globals';
import { groupCommits, generateReport } from './llm';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => {
    return {
      chat: {
        completions: {
          create: (jest.fn() as any).mockResolvedValue({
            choices: [{ message: { content: 'Mocked OpenAI response' } }]
          } as any)
        }
      }
    };
  });
});

// Mock Google Generative AI
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => {
      return {
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: (jest.fn() as any).mockResolvedValue({
            response: { text: () => 'Mocked Gemini response' }
          } as any)
        } as any)
      };
    })
  };
});

describe('Conventional Commits Grouping', () => {
  it('should categorize features and bug fixes correctly', () => {
    const commits = [
      'feat(auth): add google sso login',
      'fix(ui): fix button color spacing',
      'perf(api): speed up database queries',
      'chore(deps): bump typescript version',
      'random commit without conventional prefix'
    ];

    const result = groupCommits(commits);

    expect(result).toContain('🚀 Features:');
    expect(result).toContain('- **auth**: add google sso login');
    
    expect(result).toContain('🐛 Bug Fixes:');
    expect(result).toContain('- **ui**: fix button color spacing');

    expect(result).toContain('⚡ Performance:');
    expect(result).toContain('- **api**: speed up database queries');

    expect(result).toContain('⚙️ Chores & CI/CD:');
    expect(result).toContain('- **deps**: bump typescript version');

    expect(result).toContain('📦 Others:');
    expect(result).toContain('- random commit without conventional prefix');
  });

  it('should handle breaking changes with warning emoji', () => {
    const commits = [
      'feat(db)!: migrations for user profiles'
    ];

    const result = groupCommits(commits);
    expect(result).toContain('🚀 Features:');
    expect(result).toContain('- ⚠️ **BREAKING CHANGE** - **db**: migrations for user profiles');
  });
});

describe('LLM Report Generation', () => {
  it('should call OpenAI correctly and return results', async () => {
    const result = await generateReport(
      ['feat: add sso'],
      '',
      {
        provider: 'openai',
        apiKey: 'fake-openai-key',
        model: 'gpt-4o-mini'
      }
    );

    expect(result).toBe('Mocked OpenAI response');
  });

  it('should call Gemini correctly and return results', async () => {
    const result = await generateReport(
      ['feat: add sso'],
      '',
      {
        provider: 'gemini',
        apiKey: 'fake-gemini-key',
        model: 'gemini-1.5-flash'
      }
    );

    expect(result).toBe('Mocked Gemini response');
  });
});
