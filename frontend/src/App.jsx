import { useCallback, useEffect, useRef, useState } from 'react'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { Workflow, Search, CheckCircle2, TriangleAlert } from 'lucide-react'
import { PipelineToolbar } from '@/components/Toolbar'
import { PipelineUI } from '@/ui'
import { CommandPalette } from '@/components/CommandPalette'
import { CanvasToolbar } from '@/components/CanvasToolbar'
import { Kbd } from '@/components/Kbd'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSubmit } from '@/submit'
import { useStore } from '@/store'
import { tidyLayout } from '@/lib/layout'

const isMac =
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
const MOD = isMac ? '⌘' : 'Ctrl'

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function ResultOverlay({ feedback }) {
  if (!feedback) return null
  const { result, error, note } = feedback
  const warn = Boolean(error || note || (result && !result.is_dag))
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
      <div className="animate-in fade-in slide-in-from-top-1 flex items-center gap-2 rounded-full border border-line bg-surface/95 py-1.5 pl-3 pr-3.5 text-xs shadow-sm duration-200">
        {warn ? (
          <TriangleAlert className="size-3.5 shrink-0 text-clay" strokeWidth={2} />
        ) : (
          <CheckCircle2 className="size-3.5 shrink-0 text-faint" strokeWidth={2} />
        )}
        {error ? (
          <span className="text-clay">{error}</span>
        ) : note ? (
          <span className="text-clay">{note}</span>
        ) : (
          <span className="font-mono text-dim">
            {plural(result.num_nodes, 'node')} · {plural(result.num_edges, 'edge')}
            {' · '}
            <span className={result.is_dag ? 'text-faint' : 'text-clay'}>
              {result.is_dag ? 'valid DAG' : 'has a cycle'}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

function SearchTrigger({ mod, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-faint transition-colors hover:border-line-strong hover:text-dim"
    >
      <Search className="size-3.5" strokeWidth={2} />
      <span>Search nodes</span>
      <Kbd keys={[mod, 'K']} tone="onLight" className="ml-4" />
    </button>
  )
}

function Workspace() {
  const { fitView, screenToFlowPosition } = useReactFlow()
  const [feedback, setFeedback] = useState(null)
  const [dark, setDark] = useState(() => localStorage.getItem('vs-theme') === 'dark')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const timerRef = useRef(null)
  const fileRef = useRef(null)
  const clipboardRef = useRef(null)

  const flash = useCallback((next) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setFeedback(next)
    timerRef.current = setTimeout(() => setFeedback(null), 4000)
  }, [])

  const { submit, loading } = useSubmit({
    onResult: (value) => flash({ result: value }),
    onError: (message) => flash({ error: message }),
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('vs-theme', dark ? 'dark' : 'light')
  }, [dark])

  const undo = useCallback(() => useStore.temporal.getState().undo(), [])
  const redo = useCallback(() => useStore.temporal.getState().redo(), [])
  const clear = useCallback(() => useStore.getState().clearPipeline(), [])

  const addNodeAtCenter = useCallback(
    (type) => {
      const { getNodeID, addNode } = useStore.getState()
      const pane = document.querySelector('.react-flow')
      const rect = pane?.getBoundingClientRect()
      const position = rect
        ? screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          })
        : { x: 0, y: 0 }
      const id = getNodeID(type)
      addNode({ id, type, position, data: { id, nodeType: type } })
    },
    [screenToFlowPosition],
  )

  const tidy = useCallback(() => {
    const { nodes, edges } = useStore.getState()
    if (!nodes.length) return
    useStore.setState({ nodes: tidyLayout(nodes, edges) })
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }))
  }, [fitView])

  const cloneNodes = useCallback((sourceNodes, sourceEdges) => {
    if (!sourceNodes?.length) return
    const { getNodeID, addNodes, addEdges } = useStore.getState()
    const idMap = {}
    const clones = sourceNodes.map((node) => {
      const newId = getNodeID(node.type)
      idMap[node.id] = newId
      return {
        ...node,
        id: newId,
        position: { x: node.position.x + 36, y: node.position.y + 36 },
        selected: true,
        data: { ...node.data, id: newId },
      }
    })
    addNodes(clones)
    const clonedEdges = (sourceEdges ?? [])
      .filter((edge) => idMap[edge.source] && idMap[edge.target])
      .map((edge, index) => ({
        ...edge,
        id: `edge-${idMap[edge.source]}-${idMap[edge.target]}-${index}`,
        source: idMap[edge.source],
        target: idMap[edge.target],
        sourceHandle: edge.sourceHandle
          ? edge.sourceHandle.replace(edge.source, idMap[edge.source])
          : edge.sourceHandle,
        targetHandle: edge.targetHandle
          ? edge.targetHandle.replace(edge.target, idMap[edge.target])
          : edge.targetHandle,
      }))
    if (clonedEdges.length) addEdges(clonedEdges)
  }, [])

  const selectionWithEdges = () => {
    const { nodes, edges } = useStore.getState()
    const selected = nodes.filter((node) => node.selected)
    const ids = new Set(selected.map((node) => node.id))
    const internal = edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    )
    return { selected, internal }
  }

  const duplicateSelected = useCallback(() => {
    const { selected, internal } = selectionWithEdges()
    cloneNodes(selected, internal)
  }, [cloneNodes])

  const copy = useCallback(() => {
    const { selected, internal } = selectionWithEdges()
    if (selected.length) clipboardRef.current = { nodes: selected, edges: internal }
  }, [])

  const paste = useCallback(() => {
    const clip = clipboardRef.current
    if (clip) cloneNodes(clip.nodes, clip.edges)
  }, [cloneNodes])

  const exportJson = useCallback(() => {
    const { nodes, edges, nodeIDs } = useStore.getState()
    const blob = new Blob([JSON.stringify({ nodes, edges, nodeIDs }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'pipeline.json'
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  const importJson = useCallback(
    (event) => {
      const file = event.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          useStore.getState().loadPipeline(JSON.parse(reader.result))
          useStore.temporal.getState().clear()
          requestAnimationFrame(() => fitView({ padding: 0.2, duration: 300 }))
        } catch {
          flash({ error: 'Could not read that file' })
        }
      }
      reader.readAsText(file)
      event.target.value = ''
    },
    [fitView, flash],
  )

  useEffect(() => {
    const onKey = (event) => {
      const mod = event.metaKey || event.ctrlKey
      const target = event.target
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      const key = event.key.toLowerCase()
      if (mod && event.key === 'Enter') {
        event.preventDefault()
        submit()
        return
      }
      if (mod && key === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
        return
      }
      if (mod && key === 's') {
        event.preventDefault()
        exportJson()
        return
      }
      if (mod && key === 'o') {
        event.preventDefault()
        fileRef.current?.click()
        return
      }
      if (mod && event.shiftKey && key === 'l') {
        event.preventDefault()
        tidy()
        return
      }
      if (typing) return
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (mod && key === 'd') {
        event.preventDefault()
        duplicateSelected()
      } else if (mod && key === 'c') {
        copy()
      } else if (mod && key === 'v') {
        paste()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submit, undo, redo, duplicateSelected, copy, paste, exportJson, tidy])

  return (
    <div className="flex h-screen flex-col gap-3 bg-subtle p-3 text-ink">
      <div className="rounded-xl border border-line bg-canvas">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-ink text-canvas">
              <Workflow className="size-3.5" strokeWidth={2.25} />
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">
              Pipeline Builder
            </span>
          </div>

          <div className="flex items-center gap-2">
            <SearchTrigger mod={MOD} onClick={() => setPaletteOpen(true)} />
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md bg-ink px-2.5 py-1.5 text-[13px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? 'Submitting…' : 'Submit'}
              <Kbd keys={[MOD, '↵']} tone="onDark" />
            </button>
          </div>
        </div>
        <PipelineToolbar />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-canvas">
        <PipelineUI onCycleWarning={() => flash({ note: 'That connection creates a cycle' })} />
        <CanvasToolbar
          mod={MOD}
          dark={dark}
          onUndo={undo}
          onRedo={redo}
          onTidy={tidy}
          onToggleTheme={() => setDark((value) => !value)}
          onExport={exportJson}
          onImport={() => fileRef.current?.click()}
          onClear={clear}
        />
        <ResultOverlay feedback={feedback} />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={importJson}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onPick={addNodeAtCenter}
      />
    </div>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <TooltipProvider delayDuration={200}>
        <Workspace />
      </TooltipProvider>
    </ReactFlowProvider>
  )
}
