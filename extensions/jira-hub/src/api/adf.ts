/**
 * Atlassian Document Format (ADF) → Markdown converter.
 *
 * Ported from ~/code/src/github.com/kahl-dev/claude-config/skills/jira/scripts/lib/adf_parser.py
 * Supports:
 *   Blocks: paragraph, bulletList, orderedList, heading, codeBlock, blockquote,
 *           rule, panel, taskList, expand/nestedExpand, decisionList, mediaSingle, table
 *   Inline: text (with marks), hardBreak, mention, emoji, inlineCard, date, status, mediaInline
 *   Marks:  strong, em, strike, code, link, underline (no-op), subsup, textColor
 */
import type { AdfNode, JiraCommentBody } from '../types'

export function adfToMarkdown(adf: JiraCommentBody | AdfNode | string | undefined): string {
  if (!adf) return ''
  if (typeof adf === 'string') return adf
  return renderBlock(adf as AdfNode, 0).join('\n')
}

function renderBlock(node: AdfNode, indent: number): string[] {
  const lines: string[] = []
  const prefix = '  '.repeat(indent)
  const content = Array.isArray(node.content) ? node.content : []

  for (const block of content) {
    switch (block.type) {
      case 'paragraph': {
        const text = renderInline(block.content ?? [])
        if (text) lines.push(`${prefix}${text}`)
        break
      }
      case 'bulletList':
        lines.push(...renderList(block, /* ordered */ false, indent))
        break
      case 'orderedList':
        lines.push(...renderList(block, /* ordered */ true, indent))
        break
      case 'heading': {
        const text = renderInline(block.content ?? [])
        if (!text) break
        const level = clampHeadingLevel(getAttr(block, 'level'))
        lines.push(`${prefix}${'#'.repeat(level)} ${text}`)
        break
      }
      case 'codeBlock': {
        const language = String(getAttr(block, 'language') ?? '')
        const code = (block.content ?? [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('')
        if (code) lines.push(`${prefix}\`\`\`${language}\n${code}\n${prefix}\`\`\``)
        break
      }
      case 'blockquote': {
        const inner = renderBlock(block, 0).join('\n').trim()
        if (inner) lines.push(`${prefix}${quote(inner)}`)
        break
      }
      case 'rule':
        lines.push(`${prefix}---`)
        break
      case 'panel': {
        const panelType = String(getAttr(block, 'panelType') ?? 'info')
        const label = panelLabel(panelType)
        const inner = renderBlock(block, 0).join('\n').trim()
        if (inner) lines.push(`${prefix}> [!${label}]\n${quote(inner, prefix)}`)
        else lines.push(`${prefix}> [!${label}]`)
        break
      }
      case 'taskList':
        for (const taskItem of block.content ?? []) {
          if (taskItem.type !== 'taskItem') continue
          const state = String(getAttr(taskItem, 'state') ?? 'TODO')
          const check = state === 'DONE' ? '[x]' : '[ ]'
          const text = renderInline(taskItem.content ?? [])
          lines.push(`${prefix}- ${check} ${text}`)
        }
        break
      case 'expand':
      case 'nestedExpand': {
        const title = String(getAttr(block, 'title') ?? '')
        const header = title ? `> [!EXPAND] ${title}` : '> [!EXPAND]'
        const inner = renderBlock(block, 0).join('\n').trim()
        if (inner) lines.push(`${prefix}${header}\n${quote(inner, prefix)}`)
        else lines.push(`${prefix}${header}`)
        break
      }
      case 'decisionList':
        for (const decisionItem of block.content ?? []) {
          if (decisionItem.type !== 'decisionItem') continue
          const state = String(getAttr(decisionItem, 'state') ?? '')
          const marker = state === 'DECIDED' ? 'DECIDED' : 'OPEN'
          const text = renderInline(decisionItem.content ?? [])
          lines.push(`${prefix}> [!DECISION] ${marker}\n${prefix}> ${text}`)
        }
        break
      case 'mediaSingle':
      case 'mediaGroup':
        for (const media of block.content ?? []) {
          if (media.type !== 'media') continue
          const alt = String(getAttr(media, 'alt') ?? '')
          const filename = String(getAttr(media, 'filename') ?? '')
          const mediaType = String(getAttr(media, 'type') ?? 'file')
          lines.push(`${prefix}[Attachment: ${alt || filename || mediaType}]`)
        }
        break
      case 'table': {
        const md = renderTable(block)
        if (md) lines.push(md)
        break
      }
      default:
        break
    }
  }

  return lines
}

function renderList(block: AdfNode, ordered: boolean, indent: number): string[] {
  const lines: string[] = []
  const prefix = '  '.repeat(indent)
  const continuationPrefix = `${prefix}  `

  const items = (block.content ?? []).filter((c) => c.type === 'listItem')
  items.forEach((listItem, idx) => {
    const marker = ordered ? `${idx + 1}.` : '•'
    let firstLineDone = false

    for (const child of listItem.content ?? []) {
      if (child.type === 'paragraph') {
        const text = renderInline(child.content ?? [])
        if (!text) continue
        if (!firstLineDone) {
          lines.push(`${prefix}${marker} ${text}`)
          firstLineDone = true
        } else {
          lines.push(`${continuationPrefix}${text}`)
        }
      } else if (child.type === 'bulletList' || child.type === 'orderedList') {
        if (!firstLineDone) {
          lines.push(`${prefix}${marker}`)
          firstLineDone = true
        }
        lines.push(...renderList(child, child.type === 'orderedList', indent + 1))
      } else {
        // Generic block child: wrap as fake doc, render, then prepend marker/continuation.
        const wrapper: AdfNode = { type: 'doc', content: [child] }
        const inner = renderBlock(wrapper, 0).join('\n').trim()
        if (!inner) continue
        const innerLines = inner.split('\n')
        if (!firstLineDone) {
          if (innerLines.length === 1) {
            lines.push(`${prefix}${marker} ${inner}`)
          } else {
            lines.push(`${prefix}${marker}`)
            for (const line of innerLines) lines.push(`${continuationPrefix}${line}`)
          }
          firstLineDone = true
        } else {
          for (const line of innerLines) lines.push(`${continuationPrefix}${line}`)
        }
      }
    }
  })

  return lines
}

function renderInline(nodes: AdfNode[]): string {
  const parts: string[] = []
  for (const item of nodes) {
    switch (item.type) {
      case 'text': {
        let text = item.text ?? ''
        if (item.marks && text) text = applyMarks(text, item.marks)
        parts.push(text)
        break
      }
      case 'hardBreak':
        parts.push('\n')
        break
      case 'mention': {
        const text = String(getAttr(item, 'text') ?? '')
        if (text) parts.push(`@[${text.replace(/^@/, '')}]`)
        break
      }
      case 'emoji': {
        const text = String(getAttr(item, 'text') ?? '')
        const shortName = String(getAttr(item, 'shortName') ?? '')
        if (text && !text.startsWith(':')) parts.push(text)
        else parts.push(shortName || text)
        break
      }
      case 'inlineCard':
        parts.push(String(getAttr(item, 'url') ?? ''))
        break
      case 'date': {
        const ts = getAttr(item, 'timestamp')
        const millis = typeof ts === 'string' ? Number.parseInt(ts, 10) : Number(ts)
        if (Number.isFinite(millis)) {
          parts.push(new Date(millis).toISOString().slice(0, 10))
        } else if (ts) {
          parts.push(`[Date: ${ts}]`)
        }
        break
      }
      case 'status': {
        const text = String(getAttr(item, 'text') ?? '')
        if (text) parts.push(`[${text}]`)
        break
      }
      case 'mediaInline': {
        const alt = String(getAttr(item, 'alt') ?? '')
        parts.push(alt ? `[Image: ${alt}]` : '[Image]')
        break
      }
      default:
        break
    }
  }
  return parts.join('')
}

interface AdfMark {
  type: string
  attrs?: Record<string, unknown>
}

function applyMarks(input: string, marks: AdfMark[]): string {
  let text = input
  let hasCode = false

  for (const mark of marks) {
    switch (mark.type) {
      case 'code':
        hasCode = true
        break
      case 'strong':
        text = `**${text}**`
        break
      case 'em':
        text = `*${text}*`
        break
      case 'strike':
        text = `~~${text}~~`
        break
      case 'link': {
        const href = String(mark.attrs?.href ?? '')
        if (href) text = `[${text}](${href})`
        break
      }
      case 'underline':
        // No native markdown — preserved as-is.
        break
      case 'subsup': {
        const variant = String(mark.attrs?.type ?? '')
        if (variant === 'sub') text = `~${text}~`
        else if (variant === 'sup') text = `^${text}^`
        break
      }
      case 'textColor': {
        const color = String(mark.attrs?.color ?? '')
        if (color) text = `{color:${color}}${text}{/color}`
        break
      }
      default:
        break
    }
  }

  if (hasCode) text = `\`${text}\``
  return text
}

function renderTable(block: AdfNode): string {
  const rows: string[][] = []
  for (const row of block.content ?? []) {
    if (row.type !== 'tableRow') continue
    const cells: string[] = []
    for (const cell of row.content ?? []) {
      if (cell.type !== 'tableCell' && cell.type !== 'tableHeader') continue
      const cellText = renderBlock(cell, 0)
        .join('\n')
        .trim()
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .join(' / ')
      cells.push(cellText)
    }
    if (cells.length > 0) rows.push(cells)
  }
  if (rows.length === 0) return ''

  const header = rows[0]
  if (!header) return ''
  const out: string[] = []
  out.push(`| ${header.join(' | ')} |`)
  out.push(`|${header.map(() => '---').join('|')}|`)
  for (const row of rows.slice(1)) {
    while (row.length < header.length) row.push('')
    out.push(`| ${row.join(' | ')} |`)
  }
  return out.join('\n')
}

function quote(text: string, prefix = ''): string {
  return text
    .split('\n')
    .map((line) => (line ? `${prefix}> ${line}` : `${prefix}>`))
    .join('\n')
}

function panelLabel(panelType: string): string {
  switch (panelType) {
    case 'info':
      return 'NOTE'
    case 'note':
      return 'IMPORTANT'
    case 'warning':
      return 'WARNING'
    case 'error':
      return 'CAUTION'
    case 'success':
      return 'TIP'
    default:
      return panelType.toUpperCase()
  }
}

function clampHeadingLevel(value: unknown): number {
  const level = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(level)) return 1
  return Math.max(1, Math.min(6, Math.trunc(level)))
}

function getAttr(node: AdfNode, key: string): unknown {
  return node.attrs?.[key]
}
