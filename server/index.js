
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// In-memory rooms: { roomId: { actions: [], clients: Set(socketId), users: Map(socketId -> userId) } }
const rooms = {};

function ensureRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = { actions: [], clients: new Set(), users: new Map() };
  }
  return rooms[roomId];
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join-room', ({ roomId, userId }) => {
    if (!roomId) {
      roomId = uuidv4();
    }
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userId = userId;

    const room = ensureRoom(roomId);
    room.clients.add(socket.id);
    if (userId) {
      room.users.set(socket.id, userId);
    }

    // Send current room state plus currently known participants
    socket.emit('room-state', {
      roomId,
      actions: room.actions,
      participants: Array.from(room.users.values())
    });

    // Notify other clients in the room
    socket.to(roomId).emit('user-joined', { userId });

    console.log(`socket ${socket.id} joined ${roomId}`);
  });

  socket.on('add-action', (action) => {
    const room = ensureRoom(socket.roomId);
    if (!room) return;
    room.actions.push(action);
    socket.to(socket.roomId).emit('action-added', action);
  });

  socket.on('update-action', ({ actionId, data, replace, userId }) => {
    const room = ensureRoom(socket.roomId);
    if (!room) return;
    const idx = room.actions.findIndex(a => a.id === actionId);
    if (idx === -1) return;
    const action = room.actions[idx];
    if (action.userId !== userId) {
      socket.emit('update-denied', { actionId, reason: 'not-owner' });
      return;
    }
    action.data = replace ? data : { ...action.data, ...data };
    io.to(socket.roomId).emit('action-updated', { actionId, data: action.data });
  });

  socket.on('undo-action', ({ actionId, userId }) => {
    const room = ensureRoom(socket.roomId);
    if (!room) return;
    const idx = room.actions.findIndex(a => a.id === actionId);
    if (idx === -1) return;
    const action = room.actions[idx];
    if (action.userId !== userId) {
      socket.emit('undo-denied', { actionId, reason: 'not-owner' });
      return;
    }
    action.undone = true;
    io.to(socket.roomId).emit('action-undone', { actionId, userId });
  });

  socket.on('redo-action', ({ actionId, userId }) => {
    const room = ensureRoom(socket.roomId);
    if (!room) return;
    const idx = room.actions.findIndex(a => a.id === actionId);
    if (idx === -1) return;
    const action = room.actions[idx];
    if (action.userId !== userId) {
      socket.emit('redo-denied', { actionId, reason: 'not-owner' });
      return;
    }
    action.undone = false;
    io.to(socket.roomId).emit('action-redone', { actionId, userId });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    room.clients.delete(socket.id);
    if (room.users.has(socket.id)) {
      const userId = room.users.get(socket.id);
      room.users.delete(socket.id);
      socket.to(roomId).emit('user-left', { userId });
    }
    console.log(`socket ${socket.id} disconnected from ${roomId}`);

    if (room.clients.size === 0) {
      console.log(`room ${roomId} now has 0 clients`);
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log('Server listening on', PORT));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('Either stop the process using that port, or set PORT to a different value:');
    console.error(`  PORT=${Number(PORT) + 1} npm start`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

