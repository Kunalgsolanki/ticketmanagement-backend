require('dotenv').config();
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');

const userRoutes = require('./routes/user');
const ticketRoutes = require('./routes/ticket');
const roleRoutes = require('./routes/role');
const { seedDefaultRoles } = require('./controllers/roleController');
const registerTicketHandlers = require('./sockets/ticketSocket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  },
});

// Enable CORS for frontend clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(bodyParser.json());

app.use('/user', userRoutes);
app.use('/ticket', ticketRoutes);
app.use('/role', roleRoutes);

// Register WebSocket Ticket CRUD Handlers
registerTicketHandlers(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT} with WebSocket support enabled`);
  await seedDefaultRoles();
});