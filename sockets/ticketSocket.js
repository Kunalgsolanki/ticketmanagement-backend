const prisma = require('../prisma/client');

/**
 * Register ticket WebSocket event handlers
 * @param {import('socket.io').Server} io 
 */
function registerTicketHandlers(io) {
  io.on('connection', (socket) => {
    // console.log(`[WebSocket] Client connected: ${socket.id}`);

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
