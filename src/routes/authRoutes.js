const express = require('express');
const router = express.Router();

// placeholder — we'll fill this in next
router.get('/test', (req, res) => {
  res.json({ message: 'auth route working' });
});

module.exports = router;