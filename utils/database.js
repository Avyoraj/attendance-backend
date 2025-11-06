/**
 * 🔌 Database Connection Utility
 * 
 * Centralized MongoDB connection management
 * Optimized for Vercel serverless functions
 */

const mongoose = require('mongoose');

// Cached connection for serverless reuse
let cachedConnection = null;

/**
 * Connect to MongoDB (serverless-optimized)
 */
async function connectToMongoDB() {
  // Check if mongoose is already connected
  if (mongoose.connection.readyState === 1) {
    console.log('✅ Using existing MongoDB connection');
    return mongoose.connection;
  }

  // Check if we have a cached connection
  if (cachedConnection) {
    console.log('✅ Using cached MongoDB connection');
    return cachedConnection;
  }

  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    // Connect with optimized settings for serverless
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // Serverless optimization
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
    });

    cachedConnection = mongoose.connection;
    console.log('🚀 Connected to MongoDB successfully!');
    
    // Only log database name if available
    if (mongoose.connection.db) {
      console.log('📊 Database:', mongoose.connection.db.databaseName);
    }

    return mongoose.connection;

  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    cachedConnection = null;
    throw error;
  }
}

/**
 * Check if connected
 */
function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Disconnect from MongoDB
 */
async function disconnectFromMongoDB() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.connection.close();
  cachedConnection = null;
  console.log('👋 Disconnected from MongoDB');
}

/**
 * Middleware to ensure DB connection (serverless-optimized)
 */
const ensureConnection = async (req, res, next) => {
  try {
    // Always try to connect - it will reuse existing connection if available
    await connectToMongoDB();
    next();
  } catch (error) {
    console.error('❌ MongoDB connection error in middleware:', error.message);
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
