const prisma = require('../prisma/client');

// Helper: normalize alternate field names coming from the client
function extractCreatorId(body) {
  return body.createdById || body.creatorId;
}

function extractAssigneeId(body) {
  return body.assignedToId !== undefined ? body.assignedToId : body.assigneeId;
}

// CREATE
async function createTicket(req, res) {
  const { title, description, priority, status } = req.body;
  const targetCreatorId = extractCreatorId(req.body);
  const targetAssigneeId = extractAssigneeId(req.body);

  if (!title || !targetCreatorId) {
    return res.status(400).json({ error: 'title and createdById (or creatorId) are required' });
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

    if (req.io) req.io.emit('ticket:created', newTicket);
    res.status(201).json(newTicket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while creating the ticket' });
  }
}

// LIST ALL
async function getAllTickets(req, res) {
  try {
    const tickets = await prisma.ticket.findMany({
      include: {
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(tickets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while fetching tickets' });
  }
}

// GET ONE
async function getTicketById(req, res) {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while fetching the ticket' });
  }
}

// UPDATE
async function updateTicket(req, res) {
  const { title, description, status, priority } = req.body;
  const targetAssigneeId = extractAssigneeId(req.body);

  try {
    const updatedTicket = await prisma.ticket.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(targetAssigneeId !== undefined && {
          assignedToId: targetAssigneeId ? Number(targetAssigneeId) : null,
        }),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    if (req.io) req.io.emit('ticket:updated', updatedTicket);
    res.json(updatedTicket);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'An error occurred while updating the ticket' });
  }
}

// DELETE
async function deleteTicket(req, res) {
  try {
    const ticketId = Number(req.params.id);
    await prisma.ticket.delete({ where: { id: ticketId } });

    if (req.io) req.io.emit('ticket:deleted', { id: ticketId });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    console.error(error);
    res.status(500).json({ error: 'An error occurred while deleting the ticket' });
  }
}

// TICKETS CREATED BY A USER
async function getTicketsCreatedByUser(req, res) {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { createdById: Number(req.params.userId) },
      include: { assignedTo: { select: { id: true, name: true } } },
    });
    res.json(tickets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while fetching created tickets' });
  }
}

// TICKETS ASSIGNED TO A USER
async function getTicketsAssignedToUser(req, res) {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { assignedToId: Number(req.params.userId) },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    res.json(tickets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while fetching assigned tickets' });
  }
}

module.exports = {
  createTicket,
  getAllTickets,
  getTicketById,
  updateTicket,
  deleteTicket,
  getTicketsCreatedByUser,
  getTicketsAssignedToUser,
};