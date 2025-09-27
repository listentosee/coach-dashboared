import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const testDir = decodeURI(new URL('.', import.meta.url).pathname)
const requireFromTest = createRequire(import.meta.url)

function loadTsModule(relativePath) {
  const filename = path.resolve(testDir, relativePath)
  const source = readFileSync(filename, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  })
  const cjsModule = { exports: {} }
  const loader = new Function('exports', 'require', 'module', '__filename', '__dirname', outputText)
  loader(cjsModule.exports, requireFromTest, cjsModule, filename, path.dirname(filename))
  return cjsModule.exports
}

const utils = loadTsModule('../lib/coach-messaging/utils.ts')
const {
  deriveThreadGroups,
  plainTextSnippet,
  initialsForName,
  avatarColorForId,
} = utils

test('deriveThreadGroups groups messages by root id and sorts by latest activity', () => {
  const messages = [
    { id: '10', conversation_id: 'c1', sender_id: 'u1', body: 'Root message', created_at: '2024-01-01T10:00:00Z', parent_message_id: null },
    { id: '11', conversation_id: 'c1', sender_id: 'u2', body: 'Reply one', created_at: '2024-01-01T10:05:00Z', parent_message_id: '10' },
    { id: '12', conversation_id: 'c1', sender_id: 'u3', body: 'New root', created_at: '2024-01-01T10:10:00Z', parent_message_id: null },
    { id: '13', conversation_id: 'c1', sender_id: 'u1', body: 'Follow up', created_at: '2024-01-01T10:15:00Z', parent_message_id: '12' },
  ]

  const groups = deriveThreadGroups(messages)
  assert.equal(groups.length, 2)
  assert.equal(groups[0]?.rootId, '12')
  assert.equal(groups[0]?.messages.length, 2)
  assert.equal(groups[1]?.rootId, '10')
  assert.equal(groups[1]?.messages.length, 2)
  assert.equal(groups[0]?.messages[0]?.id, '12')
  assert.equal(groups[0]?.messages[1]?.id, '13')
})

test('deriveThreadGroups returns subject snippets from root message', () => {
  const messages = [
    { id: '21', conversation_id: 'c2', sender_id: 'u1', body: '  **Bold** update with link [Check](https://example.com) ', created_at: '2024-01-02T11:00:00Z', parent_message_id: null },
  ]
  const [group] = deriveThreadGroups(messages)
  assert.equal(group?.rootId, '21')
  assert.equal(group?.subject, 'Bold update with link Check')
})

test('plainTextSnippet trims markdown and enforces limit', () => {
  const snippet = plainTextSnippet('Paragraph with **bold** text and `code` block. '.repeat(5), 50)
  assert.equal(snippet.endsWith('...'), true)
  assert.equal(snippet.length <= 50, true)
})

test('initialsForName handles single and multi word names', () => {
  assert.equal(initialsForName('Alex Coach'), 'AC')
  assert.equal(initialsForName('alex'), 'AL')
  assert.equal(initialsForName(''), '?')
})

test('avatarColorForId provides deterministic palette selection', () => {
  const first = avatarColorForId('user-1')
  const second = avatarColorForId('user-1')
  assert.equal(first, second)
  assert.ok(['bg-sky-500','bg-emerald-500','bg-violet-500','bg-orange-500','bg-rose-500','bg-amber-500','bg-teal-500'].includes(first))
})
