const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // Header format: "Bearer <token>"
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Malformed token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, role } now available in every route
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};

module.exports = { verifyToken, requireRole };