const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');

// POST /ticket  → create a ticket
router.post('/', ticketController.createTicket);

// GET /ticket  → list all tickets
router.get('/', ticketController.getAllTickets);

// GET /ticket/:id  → get one ticket
router.get('/:id', ticketController.getTicketById);

// PATCH /ticket/:id  → update a ticket
router.patch('/:id', ticketController.updateTicket);

// DELETE /ticket/:id
router.delete('/:id', ticketController.deleteTicket);

// GET /ticket/user/:userId/created  → tickets a user created
router.get('/user/:userId/created', ticketController.getTicketsCreatedByUser);

// GET /ticket/user/:userId/assigned  → tickets assigned to a user
router.get('/user/:userId/assigned', ticketController.getTicketsAssignedToUser);

module.exports = router;