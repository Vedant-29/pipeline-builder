import { temporal } from 'zundo'
import { createWithEqualityFn } from 'zustand/traditional'
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
} from '@xyflow/react'

const STORAGE_KEY = 'pipeline-builder'

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function leadingThrottle(fn, ms) {
  let last = 0
  return (state) => {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      fn(state)
    }
  }
}

const edgeOptions = {
  type: 'deletable',
  markerEnd: { type: MarkerType.ArrowClosed, height: 18, width: 18 },
}

const stored = loadStored()

const creator = (set, get) => ({
  nodes: stored?.nodes ?? [],
  edges: stored?.edges ?? [],
  nodeIDs: stored?.nodeIDs ?? {},
  getNodeID: (type) => {
    const newIDs = { ...get().nodeIDs }
    if (newIDs[type] === undefined) {
      newIDs[type] = 0
    }
    newIDs[type] += 1
    set({ nodeIDs: newIDs })
    return `${type}-${newIDs[type]}`
  },
  addNode: (node) => {
    set({ nodes: [...get().nodes, node] })
  },
  addNodes: (nodes) => {
    set({
      nodes: [
        ...get().nodes.map((node) => ({ ...node, selected: false })),
        ...nodes,
      ],
    })
  },
  addEdges: (edges) => {
    set({ edges: [...get().edges, ...edges] })
  },
  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
  },
  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) })
  },
  onConnect: (connection) => {
    set({ edges: addEdge({ ...connection, ...edgeOptions }, get().edges) })
  },
  updateNodeField: (nodeId, fieldName, fieldValue) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, [fieldName]: fieldValue } }
          : node,
      ),
    })
  },
  setNodeSize: (nodeId, width, height) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, w: width, h: height } }
          : node,
      ),
    })
  },
  duplicateNode: (id) => {
    const node = get().nodes.find((entry) => entry.id === id)
    if (!node) return
    const newId = get().getNodeID(node.type)
    const clone = {
      ...node,
      id: newId,
      position: { x: node.position.x + 36, y: node.position.y + 36 },
      selected: true,
      data: { ...node.data, id: newId },
    }
    set({
      nodes: [
        ...get().nodes.map((entry) => ({ ...entry, selected: false })),
        clone,
      ],
    })
  },
  clearPipeline: () => {
    set({ nodes: [], edges: [] })
  },
  loadPipeline: (data) => {
    set({
      nodes: data?.nodes ?? [],
      edges: data?.edges ?? [],
      nodeIDs: data?.nodeIDs ?? {},
    })
  },
})

export const useStore = createWithEqualityFn(
  temporal(creator, {
    partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
    limit: 80,
    handleSet: (handleSet) => leadingThrottle(handleSet, 250),
  }),
)

let saveTimer
useStore.subscribe((state) => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          nodes: state.nodes,
          edges: state.edges,
          nodeIDs: state.nodeIDs,
        }),
      )
    } catch {
      return
    }
  }, 400)
})
