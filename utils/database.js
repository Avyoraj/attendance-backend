/**
 * 🔌 Database Connection Utility
 * 
 * Centralized MongoDB connection management
 */

const mongoose = require('mongoose');

let isConnected = false;

/**
 * Connect to MongoDB
 */
async function connectToMongoDB() {
  if (isConnected) {
    console.log('✅ Using existing MongoDB connection');
    return;
  }

  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log('🚀 Connected to MongoDB successfully!');
    console.log('📊 Database:', mongoose.connection.db.databaseName);

    return mongoose.connection;

  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    isConnected = false;
    throw error;
  }
}

/**
 * Check if connected
 */
function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Disconnect from MongoDB
 */
async function disconnectFromMongoDB() {
  if (!isConnected) {
    return;
  }

  await mongoose.connection.close();
  isConnected = false;
  console.log('👋 Disconnected from MongoDB');
}

/**
 * Middleware to ensure DB connection
 */
const ensureConnection = async (req, res, next) => {
  try {
    if (!isMongoConnected()) {
      await connectToMongoDB();
    }
    next();
  } catch (error) {
    res.status(500).json({ 
      error: 'Database connection failed',
      details: error.message 
    });
  }
};

module.exports = {
  connectToMongoDB,
  disconnectFromMongoDB,
  isMongoConnected,
  ensureConnection
};
