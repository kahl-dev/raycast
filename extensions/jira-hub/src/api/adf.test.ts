import { describe, it, expect } from 'vitest'
import { adfToMarkdown } from './adf'
import type { JiraCommentBody } from '../types'

describe('adfToMarkdown', () => {
  it('returns empty string for undefined', () => {
    expect(adfToMarkdown(undefined)).toBe('')
  })

  it('passes through string input', () => {
    expect(adfToMarkdown('plain string')).toBe('plain string')
  })

  it('renders paragraph with marks', () => {
    const doc: JiraCommentBody = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world', marks: [{ type: 'strong' }] },
            { type: 'text', text: '!' },
          ],
        },
      ],
    }
    expect(adfToMarkdown(doc)).toBe('Hello **world**!')
  })

  it('renders link mark', () => {
    const doc: JiraCommentBody = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Atlassian',
              marks: [{ type: 'link', attrs: { href: 'https://atlassian.com' } }],
            },
          ],
        },
      ],
    }
    expect(adfToMarkdown(doc)).toBe('[Atlassian](https://atlassian.com)')
  })

  it('renders code mark last so it wraps everything', () => {
    const doc: JiraCommentBody = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'foo',
              marks: [{ type: 'strong' }, { type: 'code' }],
            },
          ],
        },
      ],
    }
    expect(adfToMarkdown(doc)).toBe('`**foo**`')
  })

  it('renders heading with level', () => {
    const doc: JiraCommentBody = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Title' }],
        },
      ],
    }
    expect(adfToMarkdown(doc)).toBe('## Title')
  })

  it('renders bullet list', () => {
    const doc: JiraCommentBody = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }],
            },
          ],
        },
      ],
    }
    expect(adfToMarkdown(doc)).toBe('• first\n• second')
  })

  it('renders ordered list with numbers', () => {
    const doc: JiraCommentBody = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }],
            },
          ],
        },
      ],
    }
    expect(adfToMarkdown(doc)).toBe('1. a\n2. b')
  })

  it('renders code block with language', () => {
    const doc: JiraCommentBody = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'ts' },
          content: [{ type: 'text', text: 'const x = 1' }],
        },
      ],
    }
    expect(adfToMarkdown(doc)).toBe('```ts\nconst x = 1\n```')
  })

  it('renders mentions as @[Name]', () => {
    const doc: JiraCommentBody = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'hi ' },
            { type: 'mention', attrs: { text: '@Sara M.' } },
          ],
        },
      ],
    }
    expect(adfToMarkdown(doc)).toBe('hi @[Sara M.]')
  })

  it('renders rule as ---', () => {
    const doc: JiraCommentBody = {
      type: 'doc',
      version: 1,
      content: [{ type: 'rule' }],
    }
    expect(adfToMarkdown(doc)).toBe('---')
  })
})
