import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

async function loadExpensePageCache() {
    const sourcePath = join(process.cwd(), 'app/lib/expense-page-cache.ts')
    const source = readFileSync(sourcePath, 'utf8')
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ES2022,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText

    const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
    return import(moduleUrl)
}

test('expense page cache key separates scope filters and page', async () => {
    const { createExpensePageCacheKey } = await loadExpensePageCache()

    assert.equal(
        createExpensePageCacheKey({
            userId: 'user-a',
            scope: 'partner',
            year: '2026',
            month: '6',
            day: '4',
            page: 2,
        }),
        'expense-page:v1:partner:user-a:2026-06-04:p2'
    )

    assert.notEqual(
        createExpensePageCacheKey({
            userId: 'user-a',
            scope: 'partner',
            year: '2026',
            month: '6',
            day: 'all',
        }),
        createExpensePageCacheKey({
            userId: 'user-a',
            scope: 'dating',
            year: '2026',
            month: '6',
            day: 'all',
        })
    )
})

test('finance cache key separates history search and category/tag filters', async () => {
    const sourcePath = join(process.cwd(), 'app/lib/finance-calculations.ts')
    const source = readFileSync(sourcePath, 'utf8')
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ES2022,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
    const { createFinanceCacheKey } = await import(moduleUrl)

    const base = {
        userId: 'user-a',
        visibleUserIds: ['user-a', 'user-b'],
        surface: 'tracker',
        scope: 'personal',
        mode: 'month',
        year: '2026',
        month: '6',
        day: 'all',
        transactionType: 'expense',
        page: 0,
    }

    assert.notEqual(
        createFinanceCacheKey({ ...base, search: 'dinner' }),
        createFinanceCacheKey({ ...base, search: 'transport' })
    )
    assert.notEqual(
        createFinanceCacheKey({ ...base, categories: ['Food'] }),
        createFinanceCacheKey({ ...base, categories: ['Transport'] })
    )
    assert.notEqual(
        createFinanceCacheKey({ ...base, dating: true }),
        createFinanceCacheKey({ ...base, partner: true })
    )
    assert.notEqual(
        createFinanceCacheKey({ ...base, categories: ['a,b'] }),
        createFinanceCacheKey({ ...base, categories: ['a', 'b'] })
    )
})

test('finance filter controls expose tab and pressed-state semantics', () => {
    const source = readFileSync(join(process.cwd(), 'app/components/FinanceTracker.tsx'), 'utf8')

    assert.match(source, /role="tablist"/)
    assert.match(source, /role="tab"/)
    assert.match(source, /aria-selected=\{categoryLimitTab === 'limits'\}/)
    assert.match(source, /aria-selected=\{categoryLimitTab === 'actual'\}/)
    assert.match(source, /aria-pressed=\{datingFilter\}/)
    assert.match(source, /aria-pressed=\{partnerFilter\}/)
    assert.match(source, /aria-pressed=\{selected\}/)
})

test('merge unique expense rows avoids duplicate pagination records', async () => {
    const { mergeUniqueExpenseRows } = await loadExpensePageCache()

    assert.deepEqual(
        mergeUniqueExpenseRows(
            [
                { id: 'a', amount: 10 },
                { id: 'b', amount: 20 },
            ],
            [
                { id: 'b', amount: 99 },
                { id: 'c', amount: 30 },
            ]
        ),
        [
            { id: 'a', amount: 10 },
            { id: 'b', amount: 20 },
            { id: 'c', amount: 30 },
        ]
    )
})
