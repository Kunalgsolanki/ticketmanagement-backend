const prisma = require('../prisma/client');
const jwt = require('jsonwebtoken');
const { resolveUserPermissions } = require('../controllers/roleController');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

function userRoom(userId) {
  return `user:${userId}`;
}

function emitTicketNotification(io, userIds, notification) {
  [...new Set(userIds.filter(Boolean).map(Number))].forEach((userId) => {
    io.to(userRoom(userId)).emit('ticket:notification', notification);
  });
}

/**
 * Register ticket WebSocket event handlers
 * @param {import('socket.io').Server} io 
 */
function registerTicketHandlers(io) {
  io.on('connection', (socket) => {
    // console.log(`[WebSocket] Client connected: ${socket.id}`);

    socket.on('user:identify', async (payload, ackCallback) => {
      try {
        const decoded = jwt.verify(payload?.token, JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: Number(decoded.userId) } });
        if (!user) throw new Error('User not found');

        const isAdmin = user.role === 'ADMIN' || user.customRole === 'ADMIN';
        const permissions = isAdmin
          ? ['*']
          : await resolveUserPermissions(user);

        socket.userId = user.id;
        socket.userPermissions = permissions;
        socket.join(userRoom(user.id));

        if (isAdmin) {
          socket.join('ticket:admins');
        }
        if (isAdmin || permissions.includes('ticket:assign')) {
          socket.join('ticket:assigners');
        }

        if (typeof ackCallback === 'function') ackCallback({ success: true });
      } catch (error) {
        console.error('[WebSocket] user:identify error:', error.message);
        if (typeof ackCallback === 'function') ackCallback({ success: false, error: 'Invalid user session' });
      }
    });

    // Fetch all tickets
    socket.on('ticket:fetch_all', async (ackCallback) => {
      try {
        const tickets = await prisma.ticket.findMany({
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            assignedTo: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        socket.emit('ticket:all', tickets);
        if (typeof ackCallback === 'function') ackCallback({ success: true, data: tickets });
      } catch (error) {
        console.error('[WebSocket] ticket:fetch_all error:', error);
        socket.emit('ticket:error', { action: 'fetch_all', error: 'Failed to fetch tickets' });
        if (typeof ackCallback === 'function') ackCallback({ success: false, error: error.message });
      }
    });

    // Fetch single ticket details
    socket.on('ticket:fetch_one', async (payload, ackCallback) => {
      try {
        const ticketId = Number(payload?.id || payload);
        const ticket = await prisma.ticket.findUnique({
          where: { id: ticketId },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        });

        if (!ticket) {
          socket.emit('ticket:error', { action: 'fetch_one', error: 'Ticket not found' });
          if (typeof ackCallback === 'function') ackCallback({ success: false, error: 'Ticket not found' });
          return;
        }

        socket.emit('ticket:details', ticket);
        if (typeof ackCallback === 'function') ackCallback({ success: true, data: ticket });
      } catch (error) {
        console.error('[WebSocket] ticket:fetch_one error:', error);
        socket.emit('ticket:error', { action: 'fetch_one', error: 'Failed to fetch ticket' });
        if (typeof ackCallback === 'function') ackCallback({ success: false, error: error.message });
      }
    });

    // Create a new ticket
    socket.on('ticket:create', async (payload, ackCallback) => {
      const { title, description, createdById, creatorId, assignedToId, assigneeId, priority, status } = payload || {};
      const targetCreatorId = createdById || creatorId;
      const targetAssigneeId = assignedToId !== undefined ? assignedToId : assigneeId;

      if (!title || !targetCreatorId) {
        const errMsg = 'title and createdById (or creatorId) are required';
        socket.emit('ticket:error', { action: 'create', error: errMsg });
        if (typeof ackCallback === 'function') ackCallback({ success: false, error: errMsg });
        return;
      }

      try {
        const newTicket = await prisma.ticket.create({
          data: {
            title,
            description: description || '',
            createdById: Number(targetCreatorId),
            assignedToId: targetAssigneeId ? Number(targetAssigneeId) : null,
            ...(priority && { priority }),
            ...(status && { status }),
          },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        });

        // Broadcast to ALL connected clients
        io.emit('ticket:created', newTicket);
        emitTicketNotification(io, [newTicket.createdById], {
          type: 'created',
          ticket: newTicket,
          message: `Ticket #${newTicket.id} was created`,
        });
        io.to('ticket:admins').emit('ticket:notification', {
          type: 'created',
          ticket: newTicket,
          message: `New ticket #${newTicket.id} was created`,
        });
        if (newTicket.assignedToId) {
          emitTicketNotification(io, [newTicket.assignedToId], {
            type: 'assigned',
            ticket: newTicket,
            message: `Ticket #${newTicket.id} was assigned to you`,
          });
        }
        if (typeof ackCallback === 'function') ackCallback({ success: true, data: newTicket });
      } catch (error) {
        console.error('[WebSocket] ticket:create error:', error);
        socket.emit('ticket:error', { action: 'create', error: 'Failed to create ticket' });
        if (typeof ackCallback === 'function') ackCallback({ success: false, error: error.message });
      }
    });

    // Update a ticket
    socket.on('ticket:update', async (payload, ackCallback) => {
      const { id, title, description, status, priority, assignedToId, assigneeId } = payload || {};
      const ticketId = Number(id);
      const targetAssigneeId = assignedToId !== undefined ? assignedToId : assigneeId;

      if (!ticketId) {
        const errMsg = 'ticket id is required';
        socket.emit('ticket:error', { action: 'update', error: errMsg });
        if (typeof ackCallback === 'function') ackCallback({ success: false, error: errMsg });
        return;
      }

      try {
        const previousTicket = await prisma.ticket.findUnique({
          where: { id: ticketId },
          select: { assignedToId: true },
        });

        const updatedTicket = await prisma.ticket.update({
          where: { id: ticketId },
          data: {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(status !== undefined && { status }),
            ...(priority !== undefined && { priority }),
            ...(targetAssigneeId !== undefined && { assignedToId: targetAssigneeId ? Number(targetAssigneeId) : null }),
          },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        });

        // Broadcast to ALL connected clients
        io.emit('ticket:updated', updatedTicket);

        const assignmentChanged = targetAssigneeId !== undefined
          && Number(targetAssigneeId || 0) !== Number(previousTicket?.assignedToId || 0);
        if (assignmentChanged && updatedTicket.assignedToId) {
          const notification = {
            type: 'assigned',
            ticket: updatedTicket,
            message: `Ticket #${updatedTicket.id} was assigned to you`,
          };
          emitTicketNotification(io, [updatedTicket.assignedToId], notification);

          if (socket.userId && (socket.userPermissions?.includes('*') || socket.userPermissions?.includes('ticket:assign'))) {
            socket.emit('ticket:notification', {
              type: 'assignment-confirmed',
              ticket: updatedTicket,
              message: `Ticket #${updatedTicket.id} was assigned successfully`,
            });
          }
        }
        if (typeof ackCallback === 'function') ackCallback({ success: true, data: updatedTicket });
      } catch (error) {
        console.error('[WebSocket] ticket:update error:', error);
        const errMsg = error.code === 'P2025' ? 'Ticket not found' : 'Failed to update ticket';
        socket.emit('ticket:error', { action: 'update', error: errMsg });
        if (typeof ackCallback === 'function') ackCallback({ success: false, error: errMsg });
      }
    });

    // Delete a ticket
    socket.on('ticket:delete', async (payload, ackCallback) => {
      const ticketId = Number(payload?.id || payload);

      if (!ticketId) {
        const errMsg = 'ticket id is required';
        socket.emit('ticket:error', { action: 'delete', error: errMsg });
        if (typeof ackCallback === 'function') ackCallback({ success: false, error: errMsg });
        return;
      }

      try {
        await prisma.ticket.delete({
          where: { id: ticketId },
        });

        // Broadcast to ALL connected clients
        io.emit('ticket:deleted', { id: ticketId });
        if (typeof ackCallback === 'function') ackCallback({ success: true, id: ticketId });
      } catch (error) {
        console.error('[WebSocket] ticket:delete error:', error);
        const errMsg = error.code === 'P2025' ? 'Ticket not found' : 'Failed to delete ticket';
        socket.emit('ticket:error', { action: 'delete', error: errMsg });
        if (typeof ackCallback === 'function') ackCallback({ success: false, error: errMsg });
      }
    });

    // Disconnect event
    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = registerTicketHandlers;
