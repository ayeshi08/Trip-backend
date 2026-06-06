const express = require('express');
const router = express.Router();
const Trip = require('../models/Trip');

// Start a trip
router.post('/start', async (req, res) => {
  const { startLocation } = req.body;
  const trip = new Trip({ startLocation });
  await trip.save();
  res.json(trip);
});

// Stop a trip
router.post('/stop/:id', async (req, res) => {
  const { stopLocation, distance } = req.body;
  const trip = await Trip.findByIdAndUpdate(
    req.params.id,
    { stopLocation, stopTime: new Date(), distance },
    { new: true }
  );
  res.json(trip);
});

// Get all trips
router.get('/history', async (req, res) => {
  const trips = await Trip.find().sort({ startTime: -1 });
  res.json(trips);
});

// Delete a trip
router.delete('/delete/:id', async (req, res) => {
  await Trip.findByIdAndDelete(req.params.id);
  res.json({ message: 'Trip deleted' });
});

module.exports = router;