const express = require('express');
const app = express();
require('dotenv').config();

app.use(express.json());

const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

const productRoutes = require('./routes/productRoutes');
app.use('/products', productRoutes);

const orderRoutes = require('./routes/orderRoutes');
app.use('/orders', orderRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});