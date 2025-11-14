# Realtime Collaborative Canvas

A realtime collaborative whiteboard inspired by Excalidraw. The app ships with an infinite-feeling canvas, basic drawing tools, realtime rooms powered by Socket.IO and per-user undo/redo tracking.

https://excalidraw.com/iQ was used purely as inspiration — no code or assets were copied.

## Features

- Infinite canvas with smooth panning (space/middle/right drag) and zoom (Ctrl/⌘ + wheel)
- Tools: freehand pen, rectangle, ellipse, image upload, select/move, dedicated pan mode
- Images can be uploaded, positioned and resized on the board
- Realtime multi-user rooms via shareable links; no auth required
- Rooms stay alive while at least one peer is connected
- Per-user undo/redo: each user can only undo or redo their own actions
- Presence indicators (who’s online) and live status badge

## Tech Stack

- Frontend: React 18 + Vite + Socket.IO client + nanoid
- Backend: Node.js + Express + Socket.IO
- Realtime transport: WebSockets (falls back to HTTP long-polling if needed)

## Project Structure

```
.
├── client/        # React + Vite SPA
├── server/        # Express + Socket.IO service
├── README.md
└── PROMPTS.md     # AI prompt log (transparency requirement)
```

## Local Development

Requirements: Node.js 18+ and npm 9+.

### 1. Install dependencies

```bash
cd server
npm install

cd ../client
npm install
```

### 2. Run the backend

```bash
cd server
npm start
```

By default the server listens on `http://localhost:4000`. It keeps room state in-memory (good enough for demos).

### 3. Run the frontend

```bash
cd client
npm run dev
```

Vite serves the SPA on `http://localhost:5173`. The app automatically connects to `http://localhost:4000`, or you can override it with an environment variable:

```bash
VITE_SERVER_URL=https://my-production-server.example.com npm run dev
```
### Screenshot
<br/>
<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/a80440a8-50c3-4627-87eb-0cbeb2de9651" />
<br/>
![Uploading image.png…]()



### 4. Share a room

Open the UI, click **Share Room** to copy a unique room link, and send it to teammates. Everyone with the link can draw instantly—no login flow.

## Key Shortcuts & UX Notes

- Hold `Space` (or use the Pan tool) + drag to pan.
- Mouse middle/right button drag also pans.
- `Ctrl/⌘ + Wheel` zooms in/out around the cursor.
- `Ctrl/⌘ + Z` undo; `Ctrl/⌘ + Shift + Z` redo (scoped per user).
- Use the **Upload Image** button, then click-drag on the canvas to place and size the image. Use the Select tool to move/resize it later.

## Deployment Notes

- The backend is stateless aside from in-memory room storage. Deploy via any Node-friendly platform (Render, Railway, Fly.io, etc.). Consider adding persistence/cold-room eviction for production scale.
- The frontend is a standard Vite build. Run `npm run build` inside `client/` and deploy the generated `dist/` directory.

## AI Usage

All AI-assisted prompts that influenced the solution are recorded in [`PROMPTS.md`](PROMPTS.md) to satisfy the transparency requirement.

## License

MIT – see the license field in each package.json.# Realtime-canvas-app
