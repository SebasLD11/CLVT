// src/db.js
const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI missing');

  const redacted = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  const dbName = process.env.MONGO_DB || 'CLVT-BD';
  console.log('[DB] connecting to', redacted, 'db=', dbName);

  await mongoose.connect(uri, {
    dbName,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000
  });

  console.log('[DB] Connected to MongoDB Atlas');
}
module.exports = { connectDB };
