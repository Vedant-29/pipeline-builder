# Pipeline Builder

A visual pipeline editor in the browser. Drag nodes onto a canvas, wire them together, and submit the graph to a small FastAPI backend that counts nodes and edges and checks that it has no cycles.

![Pipeline Builder canvas with connected nodes](docs/hero-light.png)

[Watch the walkthrough](docs/demo.mp4) (about 5 minutes, covers the app and the code).

## Features

- Every node is a config object (title, icon, fields, handles) rendered by one shared component. Adding a node means editing data, not writing a new component.
- 10 node types, including Math, Filter, API, Note, and Conditional.
- The Text node grows as you type, and writing `{{variable}}` adds a matching input handle.
- Submit sends the graph to the backend, which returns the node count, edge count, and whether it is a valid DAG.
- Undo and redo, a command palette (Cmd+K), save and load, auto-layout, connection validation, keyboard shortcuts, and light and dark themes.

## Requirements

- Node.js and npm
- Python 3 with pip

## Setup

Run the backend and frontend in two terminals.

```sh
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

```sh
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173), build a pipeline, and click Submit. The frontend calls the backend at `http://localhost:8000/pipelines/parse`, so keep the backend on port 8000.

## Where things live

| Path | What is there |
|---|---|
| `frontend/src/nodes/registry.js` | Every node, defined as config |
| `frontend/src/nodes/BaseNode.jsx` | The component that renders all nodes |
| `frontend/src/nodes/textNode.jsx` | The Text node (variables to handles) |
| `frontend/src/store.js` | App state |
| `backend/main.py` | The submit endpoint and DAG check |

## Notes

- The backend URL is hardcoded in `frontend/src/submit.jsx`. There are no environment variables.
- The backend allows all CORS origins. It is meant for local use.

## Credits

Built with React, [@xyflow/react](https://reactflow.dev), zustand, and Tailwind on the frontend, and FastAPI on the backend.
