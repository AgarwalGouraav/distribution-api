const express = require('express');
const app = express();
const cors = require('cors');

app.use(express.json());
app.use(cors());

require('dotenv').config();

const startOverdueCheck = require('./jobs/overdueCheck');
startOverdueCheck();

const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

const productRoutes = require('./routes/productRoutes');
app.use('/products', productRoutes);

const orderRoutes = require('./routes/orderRoutes');
app.use('/orders', orderRoutes);

const paymentRoutes = require('./routes/paymentRoutes');
app.use('/payments', paymentRoutes);

const dealerRoutes = require('./routes/dealerRoutes');
app.use('/dealers', dealerRoutes);

const warehouseRoutes = require('./routes/warehouseRoutes');
app.use('/warehouses', warehouseRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});