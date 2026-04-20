import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { getAtPath, setAtPath, removeAtPath } from '../src/components/authoring/structured/pathUtils.js'
import { FieldRenderer } from '../src/components/authoring/structured/FieldRenderer.js'
import type { FieldDescriptor } from '../src/components/authoring/structured/fieldMeta.js'
import { AuthoringReadOnlyProvider } from '../src/contexts/AuthoringContexts.js'

describe('pathUtils', () => {
  it('gets and sets nested values through indexed paths', () => {
    const root = { a: { b: [{ c: 1 }, { c: 2 }] } }
    expect(getAtPath(root, 'a.b[1].c')).toBe(2)
    const next = setAtPath(root, 'a.b[1].c', 42)
    expect(getAtPath(next, 'a.b[1].c')).toBe(42)
    expect(getAtPath(root, 'a.b[1].c')).toBe(2)
  })

  it('removes array items by index', () => {
    const root = { xs: [1, 2, 3] }
    const next = removeAtPath(root, 'xs[1]')
    expect(getAtPath(next, 'xs')).toEqual([1, 3])
  })

  it('returns undefined for missing paths', () => {
    expect(getAtPath({}, 'a.b.c')).toBeUndefined()
  })
})

describe('FieldRenderer', () => {
  afterEach(cleanup)

  const renderIt = (descriptor: FieldDescriptor, value: unknown, onChange = vi.fn()): ReturnType<typeof render> =>
    render(
      <AuthoringReadOnlyProvider value={{ readOnly: false, reason: null }}>
        <FieldRenderer descriptor={descriptor} value={value} onChange={onChange} />
      </AuthoringReadOnlyProvider>,
    )

  it('renders a string field and reports changes', () => {
    const onChange = vi.fn()
    renderIt({ path: 'x', label: 'X', kind: 'string' }, 'hello', onChange)
    const input = screen.getByLabelText('X') as HTMLInputElement
    expect(input.value).toBe('hello')
    fireEvent.change(input, { target: { value: 'world' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith('world')
  })

  it('renders an enum field and saves on change', () => {
    const onChange = vi.fn()
    renderIt(
      { path: 'x', label: 'Kind', kind: 'enum', options: ['one_to_one', 'one_to_many'] },
      'one_to_one',
      onChange,
    )
    const select = screen.getByLabelText('Kind') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'one_to_many' } })
    expect(onChange).toHaveBeenCalledWith('one_to_many')
  })

  it('renders a chip array field and adds a chip on Enter', () => {
    const onChange = vi.fn()
    renderIt({ path: 'x', label: 'Non-goals', kind: 'chip-array' }, ['existing'], onChange)
    expect(screen.getByText('existing')).toBeInTheDocument()
    const input = screen.getByLabelText('Add to Non-goals') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'new' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['existing', 'new'])
  })

  it('renders a chip array field and removes a chip', () => {
    const onChange = vi.fn()
    renderIt({ path: 'x', label: 'Non-goals', kind: 'chip-array' }, ['a', 'b'], onChange)
    fireEvent.click(screen.getByLabelText('Remove a'))
    expect(onChange).toHaveBeenCalledWith(['b'])
  })

  it('renders read-only when context says so', () => {
    const onChange = vi.fn()
    render(
      <AuthoringReadOnlyProvider value={{ readOnly: true, reason: 'viewer_share' }}>
        <FieldRenderer descriptor={{ path: 'x', label: 'X', kind: 'string' }} value="hi" onChange={onChange} />
      </AuthoringReadOnlyProvider>,
    )
    expect(screen.queryByLabelText('X')).toBeNull()
    expect(screen.getByText('hi')).toBeInTheDocument()
  })

  it('renders object-array with item cards and supports add + remove', () => {
    const onChange = vi.fn()
    const descriptor: FieldDescriptor = {
      path: 'entities',
      label: 'Entities',
      kind: 'object-array',
      itemLabel: 'entity',
      itemFields: [
        { path: 'id', label: 'Id', kind: 'string' },
        { path: 'name', label: 'Name', kind: 'string' },
      ],
    }
    renderIt(descriptor, [{ id: 'todo', name: 'Todo' }], onChange)
    expect(screen.getByText('entity #1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Add entity/ }))
    expect(onChange).toHaveBeenCalledWith([
      { id: 'todo', name: 'Todo' },
      { id: '', name: '' },
    ])
  })

  it('renders an UnknownFieldShell for unknown values and allows Set value', () => {
    const onChange = vi.fn()
    renderIt(
      { path: 'x', label: 'X', kind: 'string' },
      { unknown: true, reason: 'awaiting input' },
      onChange,
    )
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('awaiting input')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set value' }))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
