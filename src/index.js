const express = require('express');
const app = express();
require('dotenv').config();

app.use(express.json());

// Routes (we'll uncomment these as we build them)
const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});